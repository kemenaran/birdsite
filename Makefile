default: build;

install:
	command -v npm >/dev/null 2>&1 || { echo >&2 "node and npm must be installed first. Aborting."; exit 1; }
	command -v web-ext >/dev/null 2>&1 || npm install --global web-ext

build:
	web-ext build --overwrite-dest

.PHONY: default install build
