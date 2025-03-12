#!/bin/bash

# Run the test_advice.ts script and save the output to a file
node --require ts-node/register src/test_advice.ts > test_advice_output.txt 2>&1

# Print the output file
echo "Test output saved to test_advice_output.txt"
echo "Contents:"
cat test_advice_output.txt 