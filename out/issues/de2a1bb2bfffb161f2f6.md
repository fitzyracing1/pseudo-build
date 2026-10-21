# [dark] PDP-10/its: doc/klotz/dec.pseudo, could not convert

<!-- pseudo-build:key=de2a1bb2bfffb161f2f6 -->

## What's broken

The pseudocode in `doc/klotz/dec.pseudo` from PDP-10/its could not be turned into working code. The converter stopped at line 1 because: Unrecognized pseudocode statement: "MacLisp Cross Assembler Documentation. KLOTZ."

This result is **dark**. It will be closed automatically as soon as the same source converts and passes (turns **lit**).

## The pseudocode

Source: https://github.com/PDP-10/its/blob/f2d00b83d7405c647547eb82e284aa66f3e3da69/doc/klotz/dec.pseudo

Excerpt (first lines):

```pseudo
MacLisp Cross Assembler Documentation. KLOTZ.
DEC compatability pseudo-op stuff.

;               Begins comment field

'               Indicates single ASCII character as a term in expressions.

^O              Indicates octal number

^B              Indicates binary number

=               Symbol assignment

.               Current location counter

```

## What was generated

Nothing was generated, because conversion stopped before any code was produced.

## The error

```
Unrecognized pseudocode statement: "MacLisp Cross Assembler Documentation. KLOTZ."
  at pseudo line: MacLisp Cross Assembler Documentation. KLOTZ.
```

## How to fix

- Line 1 uses a statement the converter does not understand. Rewrite it with one of the supported keywords (FUNCTION, IF/ELSE/END IF, FOR EACH x IN list, FOR i FROM a TO b, WHILE, REPEAT/UNTIL, SET x TO value, RETURN, PRINT, APPEND x TO list, CALL f(x)).
- If the pseudocode is fine and the converter is wrong, improve lib/convert.js in pseudo-build and add this case to the test fixtures.

## Details

| Field | Value |
|---|---|
| Status | dark |
| Stage | convert |
| Kind | pseudo-file |
| Repository | [PDP-10/its](https://github.com/PDP-10/its) |
| File | `doc/klotz/dec.pseudo` |
| Unit | 0 (starts at line 1) |
| Content hash | `b26050842ed8cf3d` |
| Dedupe key | `de2a1bb2bfffb161f2f6` |
| Local output | `out/PDP-10/its/doc_klotz_dec.pseudo` |

_Filed by pseudo-build in its own tracker. Nothing was posted to the source repository._
