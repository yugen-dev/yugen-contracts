// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IUniswapV2Factory.sol";
import "interfaces/IUniswapV2Router.sol";
import "interfaces/IUniswapV2Pair.sol";

contract UniversalConverter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeMath for uint16;
    using SafeERC20 for IERC20;
    using Address for address;

    struct TokenInfo {
        IERC20 token; // Address of the token contract.
        address[] pathToYGN;
        IUniswapV2Router router;
    }

    struct ChildFarmTokenInfo {
        IERC20 childFarmToken; // Address of the child token contract.
        address[] pathToCommonToken;
        IUniswapV2Router router;
    }

    struct LPTokenInfo {
        IERC20 lpToken; // Address of the LP token contract.
    }

    // The YGN TOKEN!
    IERC20 public ygn;

    address public fYGNBurner;
    uint16 public burnerAllocation;

    address public ygnStaker;
    uint16 public stakersAllocation;

    address public platformAddr;
    uint16 public platformFeesAllocation;

    address public treasury;
    uint16 public treasuryAllocation;

    TokenInfo[] public tokenInfo;
    mapping(IERC20 => uint256) public tokenIndexes;

    ChildFarmTokenInfo[] public childFarmTokenInfo;
    mapping(IERC20 => uint256) public childFarmTokenIndexes;

    LPTokenInfo[] public lpTokenInfo;
    mapping(IERC20 => uint256) public lpTokenIndexes;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    event YGNConverted(
        uint256 burnerAllocated,
        uint256 stakersAllocated,
        uint256 platformFees,
        uint256 treasuryAllocated
    );

    modifier ensureNonZeroAddress(address addressToCheck) {
        require(addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidRouter(IUniswapV2Router router) {
        require(address(router) != address(0), "No zero address");
        require(
            address(IUniswapV2Factory(router.factory())) != address(0),
            "Invalid Factory address"
        );
        _;
    }

    modifier validateToken(IERC20 token) {
        require(
            tokenIndexes[token] < tokenInfo.length && tokenIndexes[token] > 0,
            "Token does not exist"
        );
        _;
    }

    modifier validateChildFarmToken(IERC20 childFarmToken) {
        require(
            childFarmTokenIndexes[childFarmToken] < childFarmTokenInfo.length &&
                childFarmTokenIndexes[childFarmToken] > 0,
            "Child Farm Token does not exist"
        );
        _;
    }

    modifier validateLPToken(IERC20 lpToken) {
        require(
            lpTokenIndexes[lpToken] < lpTokenInfo.length && lpTokenIndexes[lpToken] > 0,
            "LP Token does not exist"
        );
        _;
    }

    constructor(
        IERC20 _ygn,
        address _fYGNBurner,
        uint16 _burnerAllocation,
        address _ygnStaker,
        uint16 _stakersAllocation,
        address _platformAddr,
        uint16 _platformFeesAllocation,
        address _treasury,
        uint16 _treasuryAllocation
    ) {
        ygn = _ygn;
        fYGNBurner = _fYGNBurner;
        ygnStaker = _ygnStaker;
        platformAddr = _platformAddr;
        treasury = _treasury;
        setAllocation(
            _burnerAllocation,
            _stakersAllocation,
            _platformFeesAllocation,
            _treasuryAllocation
        );
        //Filling filler tokens
        address[] memory path = new address[](2);
        tokenInfo.push(
            TokenInfo({
                token: IERC20(address(0)),
                pathToYGN: path,
                router: IUniswapV2Router(address(0))
            })
        );
        childFarmTokenInfo.push(
            ChildFarmTokenInfo({
                childFarmToken: IERC20(address(0)),
                pathToCommonToken: path,
                router: IUniswapV2Router(address(0))
            })
        );
        lpTokenInfo.push(LPTokenInfo({lpToken: IERC20(address(0))}));
    }

    //Only Owner Functions

    // Set the allocation to handle accumulated swap fees
    function setAllocation(
        uint16 _burnerAllocation,
        uint16 _stakersAllocation,
        uint16 _platformFeesAllocation,
        uint16 _treasuryAllocation
    ) public onlyOwner {
        require(
            _burnerAllocation +
                _stakersAllocation +
                _platformFeesAllocation +
                _treasuryAllocation ==
                1000,
            "invalid allocations"
        );
        burnerAllocation = _burnerAllocation;
        stakersAllocation = _stakersAllocation;
        platformFeesAllocation = _platformFeesAllocation;
        treasuryAllocation = _treasuryAllocation;
    }

    // Can be used by the owner to update the fYGN burner
    function updatefYGNBurner(address _fYGNBurner)
        external
        onlyOwner
        ensureNonZeroAddress(_fYGNBurner)
    {
        fYGNBurner = _fYGNBurner;
    }

    // Can be used by the owner to update the address for the YGNStaker
    function updateYGNStaker(address _ygnStaker)
        external
        onlyOwner
        ensureNonZeroAddress(_ygnStaker)
    {
        ygnStaker = _ygnStaker;
    }

    // Can be used by the owner to update the platformAddress
    function updatePlatformAddress(address _platformAddr)
        external
        onlyOwner
        ensureNonZeroAddress(_platformAddr)
    {
        platformAddr = _platformAddr;
    }

    // Can be used by the owner to update the address for the treasury
    function updateTreasury(address _treasury) external onlyOwner ensureNonZeroAddress(_treasury) {
        treasury = _treasury;
    }

    /**
     * @notice Update YGN address
     * @param _ygn YGN token address
     */
    function updateYGN(IERC20 _ygn) external onlyOwner ensureNonZeroAddress(address(_ygn)) {
        ygn = _ygn;
    }

    function addTokenDetails(
        IERC20 _token,
        address[] calldata _pathToYGN,
        IUniswapV2Router _router
    ) external onlyOwner ensureNonZeroAddress(address(_token)) ensureValidRouter(_router) {
        require(tokenIndexes[_token] == 0, "Token Already Added");
        require(address(_token) != address(ygn), "Token Address should not be YGN");
        require(_pathToYGN.length >= 2, "Path to YGN is incorrrect/empty");
        require(_pathToYGN[_pathToYGN.length - 1] == address(ygn), "Path should convert to YGN");

        tokenIndexes[_token] = tokenInfo.length;
        tokenInfo.push(TokenInfo({token: _token, pathToYGN: _pathToYGN, router: _router}));
    }

    function updateTokenPathToYGN(IERC20 _token, address[] calldata _pathToYGN)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        require(_pathToYGN.length >= 2, "Path to YGN is incorrrect/empty");
        require(_pathToYGN[_pathToYGN.length - 1] == address(ygn), "Path should convert to YGN");

        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        tokenDetails.pathToYGN = _pathToYGN;
    }

    function updateTokenRouter(IERC20 _token, IUniswapV2Router _router)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        ensureValidRouter(_router)
        validateToken(_token)
    {
        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        tokenDetails.router = _router;
    }

    function addChildFarmTokenDetails(
        IERC20 _childFarmToken,
        address[] calldata _pathToCommonToken,
        IUniswapV2Router _router
    ) external onlyOwner ensureNonZeroAddress(address(_childFarmToken)) ensureValidRouter(_router) {
        require(childFarmTokenIndexes[_childFarmToken] == 0, "Child Farm Token Already Added");
        require(address(_childFarmToken) != address(ygn), "Token Address should not be YGN");
        require(_pathToCommonToken.length >= 2, "Path to common token is incorrrect/empty");

        childFarmTokenIndexes[_childFarmToken] = childFarmTokenInfo.length;
        childFarmTokenInfo.push(
            ChildFarmTokenInfo({
                childFarmToken: _childFarmToken,
                pathToCommonToken: _pathToCommonToken,
                router: _router
            })
        );
    }

    function updateChildFarmTokenPathToCommonToken(
        IERC20 _childFarmToken,
        address[] calldata _pathToCommonToken
    )
        external
        onlyOwner
        ensureNonZeroAddress(address(_childFarmToken))
        validateChildFarmToken(_childFarmToken)
    {
        require(_pathToCommonToken.length >= 2, "Path to common token is incorrrect/empty");

        ChildFarmTokenInfo storage childFarmTokenDetails = childFarmTokenInfo[
            childFarmTokenIndexes[_childFarmToken]
        ];
        childFarmTokenDetails.pathToCommonToken = _pathToCommonToken;
    }

    function updateChildFarmTokenRouter(IERC20 _childFarmToken, IUniswapV2Router _router)
        external
        onlyOwner
        ensureNonZeroAddress(address(_childFarmToken))
        ensureValidRouter(_router)
        validateChildFarmToken(_childFarmToken)
    {
        ChildFarmTokenInfo storage childFarmTokenDetails = childFarmTokenInfo[
            childFarmTokenIndexes[_childFarmToken]
        ];
        childFarmTokenDetails.router = _router;
    }

    function addLPTokenDetails(IERC20 _lpToken)
        external
        onlyOwner
        ensureNonZeroAddress(address(_lpToken))
    {
        require(address(_lpToken) != address(ygn), "Token Address should not be YGN");
        require(lpTokenIndexes[_lpToken] == 0, "LP Token Already Added");

        lpTokenIndexes[_lpToken] = lpTokenInfo.length;
        lpTokenInfo.push(LPTokenInfo({lpToken: _lpToken}));
    }

    function rescueFunds(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        IERC20(token).safeTransfer(owner(), balance);
    }

    //View Functions

    function totalTokens() external view returns (uint256) {
        return tokenInfo.length;
    }

    function totalChildFarmTokens() external view returns (uint256) {
        return childFarmTokenInfo.length;
    }

    function totalLPTokens() external view returns (uint256) {
        return lpTokenInfo.length;
    }

    //Public Functions

    function convertToken(IERC20 _token)
        external
        nonReentrant
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        address[] memory pathToYGN = tokenDetails.pathToYGN;
        if (tokenDetails.token.balanceOf(address(this)) > 0) {
            require(
                pathToYGN[pathToYGN.length - 1] == address(ygn),
                "Token should only be swapped to YGN"
            );
            _swapToken(address(tokenDetails.token), pathToYGN, tokenDetails.router);
            _allocateYGN();
        }
    }

    /**
    @notice convertToYGN is used to convert tokens received by the converter contract to YGN.
    It uses the Router to convert the ERC20 tokens to YGN. The YGN accumulated is used to allocate to different contracts as per their allocation share.
    */
    function convertTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        for (uint256 i = 1; i < tokenInfo.length; i++) {
            TokenInfo storage tokenDetails = tokenInfo[i];
            address[] memory pathToYGN = tokenDetails.pathToYGN;
            if (tokenDetails.token.balanceOf(address(this)) > 0) {
                require(
                    pathToYGN[pathToYGN.length - 1] == address(ygn),
                    "Token should only be swapped to YGN"
                );
                _swapToken(address(tokenDetails.token), pathToYGN, tokenDetails.router);
            }
        }
        _allocateYGN();
    }

    /**
    @notice convertChildToken is used to convert child tokens received by the converter contract to the token provided in the path.
    */
    function convertChildFarmToken(IERC20 _childFarmToken)
        public
        nonReentrant
        ensureNonZeroAddress(address(_childFarmToken))
        validateChildFarmToken(_childFarmToken)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        ChildFarmTokenInfo storage childFarmTokenDetails = childFarmTokenInfo[
            childFarmTokenIndexes[_childFarmToken]
        ];
        if (childFarmTokenDetails.childFarmToken.balanceOf(address(this)) > 0) {
            _swapToken(
                address(childFarmTokenDetails.childFarmToken),
                childFarmTokenDetails.pathToCommonToken,
                childFarmTokenDetails.router
            );
        }
    }

    /**
    @notice convertChildToken is used to convert child tokens received by the converter contract to the token provided in the path.
    */
    function convertChildFarmTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        for (uint256 i = 1; i < childFarmTokenInfo.length; i++) {
            ChildFarmTokenInfo storage childFarmTokenDetails = childFarmTokenInfo[i];
            if (childFarmTokenDetails.childFarmToken.balanceOf(address(this)) > 0) {
                _swapToken(
                    address(childFarmTokenDetails.childFarmToken),
                    childFarmTokenDetails.pathToCommonToken,
                    childFarmTokenDetails.router
                );
            }
        }
    }

    function convertLPToken(IERC20 _lpToken)
        public
        nonReentrant
        ensureNonZeroAddress(address(_lpToken))
        validateLPToken(_lpToken)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        LPTokenInfo storage lpTokenDetails = lpTokenInfo[lpTokenIndexes[_lpToken]];
        if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
            IUniswapV2Pair pair = IUniswapV2Pair(address(lpTokenDetails.lpToken));
            require(address(pair) != address(0), "Invalid pair");
            _safeTransfer(address(pair), address(pair), pair.balanceOf(address(this)));
            pair.burn(address(this));
        }
    }

    function convertLPTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        for (uint256 i = 1; i < lpTokenInfo.length; i++) {
            LPTokenInfo storage lpTokenDetails = lpTokenInfo[i];
            if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
                IUniswapV2Pair pair = IUniswapV2Pair(address(lpTokenDetails.lpToken));
                require(address(pair) != address(0), "Invalid pair");
                _safeTransfer(address(pair), address(pair), pair.balanceOf(address(this)));
                pair.burn(address(this));
            }
        }
    }

    //Internal Functions

    /**
    @notice This function is used to swap ERC20 <> ERC20
    @param token The token address to swap from.
    @param path The path to take for the token swap
    @param router The router contract to be used for the token swap
    */
    function _swapToken(
        address token,
        address[] memory path,
        IUniswapV2Router router
    ) internal {
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(tokenBalance > 0, "Contract should have token balance greater than 0");
        IERC20(token).safeApprove(address(router), 0);
        IERC20(token).safeApprove(address(router), tokenBalance);

        uint256 swappedAmount = router.swapExactTokensForTokens(
            tokenBalance,
            1,
            path,
            address(this),
            DEADLINE
        )[path.length - 1];

        require(swappedAmount > 0, "Error in Swapping Tokens");
    }

    /*
    Internal method used by the converter to allocate swapped/converted YGN 
    to different contracts as per their allocation share.
    */
    function _allocateYGN() internal {
        uint256 totalYGNAccumulated = IERC20(ygn).balanceOf(address(this));
        if (totalYGNAccumulated > 0) {
            ygn.safeTransfer(fYGNBurner, totalYGNAccumulated.mul(burnerAllocation).div(1000));
            ygn.safeTransfer(ygnStaker, totalYGNAccumulated.mul(stakersAllocation).div(1000));
            ygn.safeTransfer(
                platformAddr,
                totalYGNAccumulated.mul(platformFeesAllocation).div(1000)
            );
            ygn.safeTransfer(treasury, totalYGNAccumulated.mul(treasuryAllocation).div(1000));
            emit YGNConverted(
                totalYGNAccumulated.mul(burnerAllocation).div(1000),
                totalYGNAccumulated.mul(stakersAllocation).div(1000),
                totalYGNAccumulated.mul(platformFeesAllocation).div(1000),
                totalYGNAccumulated.mul(treasuryAllocation).div(1000)
            );
        }
    }

    // Wrapper for safeTransfer
    function _safeTransfer(
        address token,
        address to,
        uint256 amount
    ) internal {
        IERC20(token).safeTransfer(to, amount);
    }
}
