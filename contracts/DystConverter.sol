// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IDystRouter01.sol";
import "interfaces/IDystFactory.sol";
import "interfaces/IDystPair.sol";
import "./libraries/TransferHelper.sol";

contract DystConverter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    struct Route {
        address from;
        address to;
        bool stable;
    }

    struct TokenInfo {
        IERC20 token; // Address of the token contract.
        Route[] pathToWMATIC;
        IDystRouter01 router;
    }

    struct ChildFarmTokenInfo {
        IERC20 childFarmToken; // Address of the child token contract.
        Route[] pathToCommonToken;
        IDystRouter01 router;
    }

    struct LPTokenInfo {
        IERC20 lpToken; // Address of the LP token contract.
    }

    // The WMATIC TOKEN!
    IERC20 public wmatic;

    //The YGN Converter.
    address public ygnConverter;

    TokenInfo[] public tokenInfo;
    mapping(IERC20 => uint256) public tokenIndexes;

    ChildFarmTokenInfo[] public childFarmTokenInfo;
    mapping(IERC20 => uint256) public childFarmTokenIndexes;

    LPTokenInfo[] public lpTokenInfo;
    mapping(IERC20 => uint256) public lpTokenIndexes;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    event SetYGNConverter(address indexed owner, address indexed ygnConverter);

    modifier ensureNonZeroAddress(address _addressToCheck) {
        require(_addressToCheck != address(0), "No zero address");
        _;
    }

    modifier ensureValidRouter(IDystRouter01 _router) {
        require(address(_router) != address(0), "No zero address");
        require(address(IDystFactory(_router.factory())) != address(0), "Invalid Factory address");
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

    constructor(IERC20 _wmatic, address _ygnConverter) {
        wmatic = _wmatic;
        ygnConverter = _ygnConverter;
        //Filling filler tokens
        Route[] memory path = new Route[](2);
        tokenInfo.push(
            TokenInfo({
                token: IERC20(address(0)),
                pathToWMATIC: path,
                router: IDystRouter01(address(0))
            })
        );
        childFarmTokenInfo.push(
            ChildFarmTokenInfo({
                childFarmToken: IERC20(address(0)),
                pathToCommonToken: path,
                router: IDystRouter01(address(0))
            })
        );
        lpTokenInfo.push(LPTokenInfo({lpToken: IERC20(address(0))}));
    }

    //Only Owner Functions

    /**
     * @notice Update WMATIC address
     * @param _wmatic WMATIC token address
     */
    function updateWMATIC(IERC20 _wmatic)
        external
        onlyOwner
        ensureNonZeroAddress(address(_wmatic))
    {
        wmatic = _wmatic;
    }

    // Update YGN Converter
    function setYGNConverter(address _ygnConverter)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_ygnConverter)
    {
        ygnConverter = _ygnConverter;
        emit SetYGNConverter(_msgSender(), _ygnConverter);
    }

    function addTokenDetails(
        IERC20 _token,
        Route[] calldata _pathToWMATIC,
        IDystRouter01 _router
    ) external onlyOwner ensureNonZeroAddress(address(_token)) ensureValidRouter(_router) {
        require(tokenIndexes[_token] == 0, "Token Already Added");
        require(address(_token) != address(wmatic), "Token Address should not be WMATIC");
        require(_pathToWMATIC.length >= 2, "Path to WMATIC is incorrrect/empty");
        require(
            _pathToWMATIC[_pathToWMATIC.length - 1].to == address(wmatic),
            "Path should convert to WMATIC"
        );

        tokenIndexes[_token] = tokenInfo.length;
        tokenInfo.push(TokenInfo({token: _token, pathToWMATIC: _pathToWMATIC, router: _router}));
    }

    function updateTokenPathToWMATIC(IERC20 _token, Route[] calldata _pathToWMATIC)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        require(_pathToWMATIC.length >= 2, "Path to WMATIC is incorrrect/empty");
        require(
            _pathToWMATIC[_pathToWMATIC.length - 1].to == address(wmatic),
            "Path should convert to WMATIC"
        );

        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        tokenDetails.pathToWMATIC = _pathToWMATIC;
    }

    function updateTokenRouter(IERC20 _token, IDystRouter01 _router)
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
        Route[] calldata _pathToCommonToken,
        IDystRouter01 _router
    ) external onlyOwner ensureNonZeroAddress(address(_childFarmToken)) ensureValidRouter(_router) {
        require(childFarmTokenIndexes[_childFarmToken] == 0, "Child Farm Token Already Added");
        require(address(_childFarmToken) != address(wmatic), "Token Address should not be WMATIC");
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
        Route[] calldata _pathToCommonToken
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

    function updateChildFarmTokenRouter(IERC20 _childFarmToken, IDystRouter01 _router)
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
        require(address(_lpToken) != address(wmatic), "Token Address should not be WMATIC");
        require(lpTokenIndexes[_lpToken] == 0, "LP Token Already Added");

        lpTokenIndexes[_lpToken] = lpTokenInfo.length;
        lpTokenInfo.push(LPTokenInfo({lpToken: _lpToken}));
    }

    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Insufficient token balance");
        TransferHelper.safeTransfer(_token, owner(), balance);
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
        TokenInfo memory tokenDetails = tokenInfo[tokenIndexes[_token]];
        Route[] memory pathToWMATIC = tokenDetails.pathToWMATIC;
        if (tokenDetails.token.balanceOf(address(this)) > 0) {
            require(
                pathToWMATIC[pathToWMATIC.length - 1].to == address(wmatic),
                "Token should only be swapped to WMATIC"
            );
            _swapToken(address(tokenDetails.token), pathToWMATIC, tokenDetails.router);
        }
    }

    /**
    @notice convertTokens is used to convert tokens received by the converter contract to WMATIC.
    It uses the Router to convert the ERC20 tokens to WMATIC. The WMATIC accumulated is used to send to ygn converter
    */
    function convertTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        for (uint256 i = 1; i < tokenInfo.length; i++) {
            TokenInfo memory tokenDetails = tokenInfo[i];
            Route[] memory pathToWMATIC = tokenDetails.pathToWMATIC;
            if (tokenDetails.token.balanceOf(address(this)) > 0) {
                require(
                    pathToWMATIC[pathToWMATIC.length - 1].to == address(wmatic),
                    "Token should only be swapped to WMATIC"
                );
                _swapToken(address(tokenDetails.token), pathToWMATIC, tokenDetails.router);
            }
        }
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

        ChildFarmTokenInfo memory childFarmTokenDetails = childFarmTokenInfo[
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
            ChildFarmTokenInfo memory childFarmTokenDetails = childFarmTokenInfo[i];
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
        LPTokenInfo memory lpTokenDetails = lpTokenInfo[lpTokenIndexes[_lpToken]];
        if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
            IDystPair pair = IDystPair(address(lpTokenDetails.lpToken));
            require(address(pair) != address(0), "Invalid pair");
            TransferHelper.safeTransfer(
                address(pair),
                address(pair),
                pair.balanceOf(address(this))
            );
            pair.burn(address(this));
        }
    }

    function convertLPTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");

        for (uint256 i = 1; i < lpTokenInfo.length; i++) {
            LPTokenInfo memory lpTokenDetails = lpTokenInfo[i];
            if (lpTokenDetails.lpToken.balanceOf(address(this)) > 0) {
                IDystPair pair = IDystPair(address(lpTokenDetails.lpToken));
                require(address(pair) != address(0), "Invalid pair");
                TransferHelper.safeTransfer(
                    address(pair),
                    address(pair),
                    pair.balanceOf(address(this))
                );
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
        Route[] memory path,
        IDystRouter01 router
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
}
