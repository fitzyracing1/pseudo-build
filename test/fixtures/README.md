# Algorithms

Bubble sort:

```pseudocode
FUNCTION bubbleSort(arr)
  FOR i FROM 0 TO length of arr - 2
    FOR j FROM 0 TO length of arr - i - 2
      IF arr[j] > arr[j + 1] THEN
        SWAP arr[j] AND arr[j + 1]
      END IF
    END FOR
  END FOR
  RETURN arr
END FUNCTION
EXAMPLE bubbleSort([3, 1, 2]) -> [1, 2, 3]
```

Max with a wrong example (tests fail):

```pseudo
FUNCTION maxOf(xs)
  SET best TO xs[0]
  FOR EACH x IN xs
    IF x > best THEN
      best = x
    END IF
  END FOR
  RETURN best
END FUNCTION
EXAMPLE maxOf([4, 9, 2]) -> 4
```

Prose pseudocode (cannot convert):

```pseudo
procedure greet
  obtain the user's name somehow
end
```
