default: all;

install:
	command -v npm >/dev/null 2>&1 || { echo >&2 "node and npm must be installed first. Aborting."; exit 1; }
	command -v web-ext >/dev/null 2>&1 || npm install --global web-ext
	command -v eslint  >/dev/null 2>&1 || npm install --global eslint

build:
	web-ext build --overwrite-dest --ignore-files="assets/"

test:
	eslint js/
	web-ext lint --ignore-files js/lib/twitter-text.js

all: install build test

.PHONY: default install build test all
