#!/bin/sh
cd .hooks

# Copy all Git hooks to the `.git/hooks` directory, with filename extensions removed.
for file in *.git-hook.sh; do
    cp -- "$file" "../.git/hooks/${file%%.git-hook.sh}"
    echo $file
done
