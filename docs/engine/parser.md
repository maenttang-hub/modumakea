# Parser Layer

ModuMake now has a dedicated parser facade in [src/lib/ast-parser.ts](/Users/gimdong-il/Desktop/프로그램/modumake/src/lib/ast-parser.ts).

## What it does today

- Strips C/C++ comments before analysis.
- Resolves common Arduino pin aliases such as `#define LED_PIN 13`.
- Extracts `pinMode`, `digitalWrite`, `analogWrite`, `digitalRead`, and `analogRead`.
- Follows simple wrapper calls where a helper function forwards pin arguments.

## Why it exists

The verifier should not own sketch parsing forever. This facade gives us one place to swap in a deeper parser later without rewriting the verification engine again.

## Current limitation

The current implementation is still a lightweight fallback parser, not a full Tree-sitter integration. It is good for the sketch patterns we already verify and is covered by unit tests, but macro-heavy C++ still needs a true AST backend in a later milestone.
