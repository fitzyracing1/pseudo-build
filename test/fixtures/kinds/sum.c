#include <stdio.h>
/*
 * Pseudocode for sum:
 * FUNCTION sumTo(n)
 *   SET total TO 0
 *   FOR i FROM 1 TO n
 *     total = total + i
 *   END FOR
 *   RETURN total
 * END FUNCTION
 * EXAMPLE sumTo(4) -> 10
 */
int sumTo(int n) { int t = 0; for (int i = 1; i <= n; i++) t += i; return t; }
// IF x THEN
// we should handle this later
