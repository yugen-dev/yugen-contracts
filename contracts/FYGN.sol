// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FYGN is ERC20Burnable, Ownable {
    mapping(address => bool) public whitelistedMinters;

    modifier onlyWhitelistedMinter() {
        require(whitelistedMinters[msg.sender], "User not whitelisted");
        _;
    }

    constructor(string memory name_, string memory symbol_) public ERC20(name_, symbol_) {}

    function whitelistMinter(address _whitelistAddress) public onlyOwner {
        require(_whitelistAddress != address(0), "Not owner");

        whitelistedMinters[_whitelistAddress] = true;
    }

    function mint(address account, uint256 amount) external onlyWhitelistedMinter {
        _mint(account, amount);
    }
}
