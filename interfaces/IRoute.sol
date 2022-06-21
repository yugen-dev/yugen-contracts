// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

interface IRoute {
    struct Route {
        address from;
        address to;
        bool stable;
    }
}
