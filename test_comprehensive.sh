#!/bin/bash

# Run the comprehensive test and save the output to a file
node --require ts-node/register src/test_comprehensive.ts > test_comprehensive_output.txt 2>&1

# Print the output file
echo "Comprehensive test output saved to test_comprehensive_output.txt"
echo "Contents:"
cat test_comprehensive_output.txt 