# Flash Guide

## Before flashing

Make sure these are true:

- review panel has no error-level issues
- the code panel has a sketch you actually want to upload
- you have run the design once in the terminal panel
- your board is visible to WebSerial in a Chromium-based browser

## If upload fails

Use the built-in USB troubleshooter and check:

- board power LED
- USB data cable, not charge-only cable
- driver family such as CH340, FTDI, or CP210x
- baud rate and bootloader expectations for the selected board

## Important note

Flashing is still a guided MVP path. The browser flow is meant to help you prepare the design and reduce obvious mistakes before you move to real hardware.
