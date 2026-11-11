#!/usr/bin/env bash
set -euo pipefail

npm install --no-package-lock --silent
npm run build
