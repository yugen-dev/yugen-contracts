// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "interfaces/IDystRouter01.sol";
import "interfaces/IDystFactory.sol";
import "interfaces/IDystPair.sol";
import "interfaces/IRoute.sol";
import "./libraries/TransferHelper.sol";

contract DystConverter is Ownable, ReentrancyGuard, IRoute {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct TokenInfo {
        IERC20 token; // Address of the token contract.
        Route[] pathToUSDC;
        IDystRouter01 router;
    }

    struct LPTokenInfo {
        IERC20 lpToken; // Address of the LP token contract.
    }

    // The USDC TOKEN!
    IERC20 public usdc;

    //The YGN Converter.
    address public ygnConverter;

    TokenInfo[] public tokenInfo;
    mapping(IERC20 => uint256) public tokenIndexes;

    LPTokenInfo[] public lpTokenInfo;
    mapping(IERC20 => uint256) public lpTokenIndexes;

    uint256 private constant DEADLINE =
        0xf000000000000000000000000000000000000000000000000000000000000000;

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

    modifier validateLPToken(IERC20 lpToken) {
        require(
            lpTokenIndexes[lpToken] < lpTokenInfo.length && lpTokenIndexes[lpToken] > 0,
            "LP Token does not exist"
        );
        _;
    }

    constructor(IERC20 _usdc, address _ygnConverter) {
        require(address(_usdc) != address(0), "Invalid USDC address");
        require(_ygnConverter != address(0), "Invalid YGN Converter address");
        usdc = _usdc;
        ygnConverter = _ygnConverter;
        //Filling filler tokens
        TokenInfo storage tokenInfoStorage = tokenInfo.push();
        tokenInfoStorage.token = IERC20(address(0));
        tokenInfoStorage.router = IDystRouter01(address(0));
        lpTokenInfo.push(LPTokenInfo({lpToken: IERC20(address(0))}));
    }

    //Only Owner Functions

    // Update YGN Converter
    function setYGNConverter(address _ygnConverter)
        external
        onlyOwner
        nonReentrant
        ensureNonZeroAddress(_ygnConverter)
    {
        ygnConverter = _ygnConverter;
    }

    function addTokenDetails(
        IERC20 _token,
        Route[] memory _pathToUSDC,
        IDystRouter01 _router
    ) external onlyOwner ensureNonZeroAddress(address(_token)) ensureValidRouter(_router) {
        require(tokenIndexes[_token] == 0, "Token Already Added");
        require(address(_token) != address(usdc), "Token Address should not be USDC");
        require(_pathToUSDC.length > 0, "Path to USDC is incorrrect/empty");
        require(
            _pathToUSDC[_pathToUSDC.length - 1].to == address(usdc),
            "Path should convert to USDC"
        );

        tokenIndexes[_token] = tokenInfo.length;
        TokenInfo storage tokenDetails = tokenInfo.push();
        tokenDetails.token = _token;
        tokenDetails.router = _router;
        for (uint256 i = 0; i < _pathToUSDC.length; i++) {
            tokenDetails.pathToUSDC.push(_pathToUSDC[i]);
        }
    }

    function updateTokenPathToUSDC(IERC20 _token, Route[] calldata _pathToUSDC)
        external
        onlyOwner
        ensureNonZeroAddress(address(_token))
        validateToken(_token)
    {
        require(_pathToUSDC.length > 0, "Path to USDC is incorrrect/empty");
        require(
            _pathToUSDC[_pathToUSDC.length - 1].to == address(usdc),
            "Path should convert to USDC"
        );

        TokenInfo storage tokenDetails = tokenInfo[tokenIndexes[_token]];
        delete tokenDetails.pathToUSDC;
        for (uint256 i = 0; i < _pathToUSDC.length; i++) {
            tokenDetails.pathToUSDC.push(_pathToUSDC[i]);
        }
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

    //Be carefult to only add LPs here
    function addLPTokenDetails(IERC20 _lpToken)
        external
        onlyOwner
        ensureNonZeroAddress(address(_lpToken))
    {
        require(address(_lpToken) != address(usdc), "Token Address should not be USDC");
        require(lpTokenIndexes[_lpToken] == 0, "LP Token Already Added");

        lpTokenIndexes[_lpToken] = lpTokenInfo.length;
        lpTokenInfo.push(LPTokenInfo({lpToken: _lpToken}));
    }

    function rescueFunds(address _token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (balance > 0) {
            TransferHelper.safeTransfer(_token, owner(), balance);
        }
    }

    //View Functions

    function totalTokens() external view returns (uint256) {
        return tokenInfo.length;
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
        Route[] memory pathToUSDC = tokenDetails.pathToUSDC;
        if (tokenDetails.token.balanceOf(address(this)) > 0) {
            require(
                pathToUSDC[pathToUSDC.length - 1].to == address(usdc),
                "Token should only be swapped to USDC"
            );
            _swapToken(address(tokenDetails.token), pathToUSDC, tokenDetails.router);
            _transferUSDCToConverter();
        }
    }

    /**
    @notice convertTokens is used to convert tokens received by the converter contract to USDC.
    It uses the Router to convert the ERC20 tokens to USDC. The USDC accumulated is used to send to ygn converter
    */
    function convertTokens() external nonReentrant {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        for (uint256 i = 1; i < tokenInfo.length; i++) {
            TokenInfo memory tokenDetails = tokenInfo[i];
            Route[] memory pathToUSDC = tokenDetails.pathToUSDC;
            if (tokenDetails.token.balanceOf(address(this)) > 0) {
                require(
                    pathToUSDC[pathToUSDC.length - 1].to == address(usdc),
                    "Token should only be swapped to USDC"
                );
                _swapToken(address(tokenDetails.token), pathToUSDC, tokenDetails.router);
            }
        }
        _transferUSDCToConverter();
    }

    function convertLPToken(IERC20 _lpToken)
        external
        nonReentrant
        ensureNonZeroAddress(address(_lpToken))
        validateLPToken(_lpToken)
    {
        // At least we try to make front-running harder to do.
        require(msg.sender == tx.origin, "do not convert from contract");
        LPTokenInfo memory lpTokenDetails = lpTokenInfo[lpTokenIndexes[_lpToken]];
        IDystPair pair = IDystPair(address(lpTokenDetails.lpToken));
        require(address(pair) != address(0), "Invalid pair");
        if (pair.balanceOf(address(this)) > 0) {
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
            IDystPair pair = IDystPair(address(lpTokenDetails.lpToken));
            require(address(pair) != address(0), "Invalid pair");
            if (pair.balanceOf(address(this)) > 0) {
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

    /*
    Internal method used by the converter to send converted USDC to YFN Converter
    */
    function _transferUSDCToConverter() internal {
        uint256 usdcBalance = IERC20(usdc).balanceOf(address(this));
        if (usdcBalance > 0) {
            TransferHelper.safeTransfer(address(usdc), ygnConverter, usdcBalance);
        }
    }

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
        TransferHelper.safeApprove(token, address(router), 0);
        TransferHelper.safeApprove(token, address(router), tokenBalance);

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
