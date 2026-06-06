#!/bin/bash
ord --bitcoin-rpc-url http://127.0.0.1:8332 --bitcoin-rpc-username bitcoin --bitcoin-rpc-password bitcoin --data-dir /Volumes/Bitcoin/Ord --index-sats "$@"
