import math

def gcd(a, b):
    """
    Pseudocode:
    FUNCTION gcd(a, b)
      WHILE b != 0
        SET t TO b
        b = a MOD b
        a = t
      END WHILE
      RETURN a
    END FUNCTION
    EXAMPLE gcd(48, 18) -> 6
    """
    return math.gcd(a, b)

# Regular comment about imports.
# Nothing to see here.

def nothing():
    """Just a normal docstring."""
