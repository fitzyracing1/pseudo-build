# Notes

Indented pseudocode:

    FUNCTION double(x)
      RETURN x * 2
    END FUNCTION
    EXAMPLE double(4) -> 8

Untagged fence that is pseudocode:

```
FUNCTION isEven(n)
  IF n MOD 2 = 0 THEN
    RETURN TRUE
  END IF
  RETURN FALSE
END FUNCTION
EXAMPLE isEven(4) -> true
```

A JS fence that must be ignored:

```js
if (x) { return 1; }
```
