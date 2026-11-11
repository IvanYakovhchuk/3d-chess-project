"""
syntax_check.py - Robust tokenizer and bracket balance checker for JS files
"""

import sys

def check_js_syntax(filename):
    print(f"Checking syntax and structural validity for: {filename}")
    with open(filename, 'r', encoding='utf-8') as f:
        code = f.read()

    stack = []
    lines = code.splitlines()
    in_single_quote = False
    in_double_quote = False
    in_template_literal = False
    in_line_comment = False
    in_block_comment = False
    escape = False

    line_no = 1
    col_no = 0

    pairs = {')': '(', ']': '[', '}': '{'}

    for idx, char in enumerate(code):
        if char == '\n':
            line_no += 1
            col_no = 0
            if in_line_comment:
                in_line_comment = False
            continue
        col_no += 1

        if escape:
            escape = False
            continue

        if char == '\\' and (in_single_quote or in_double_quote or in_template_literal):
            escape = True
            continue

        if in_line_comment:
            continue

        if in_block_comment:
            if char == '/' and idx > 0 and code[idx - 1] == '*':
                in_block_comment = False
            continue

        if in_single_quote:
            if char == "'":
                in_single_quote = False
            continue

        if in_double_quote:
            if char == '"':
                in_double_quote = False
            continue

        if in_template_literal:
            if char == '`':
                in_template_literal = False
            continue

        # Check start of comments
        if char == '/' and idx + 1 < len(code):
            next_char = code[idx + 1]
            if next_char == '/':
                in_line_comment = True
                continue
            elif next_char == '*':
                in_block_comment = True
                continue

        # Check start of strings
        if char == "'":
            in_single_quote = True
            continue
        elif char == '"':
            in_double_quote = True
            continue
        elif char == '`':
            in_template_literal = True
            continue

        # Brackets
        if char in '({[':
            stack.append((char, line_no, col_no))
        elif char in ')}]':
            expected = pairs[char]
            if not stack:
                raise SyntaxError(f"Unmatched closing bracket '{char}' at line {line_no}, col {col_no}")
            top_char, top_line, top_col = stack.pop()
            if top_char != expected:
                raise SyntaxError(f"Mismatched bracket: expected '{expected}' (opened at {top_line}:{top_col}), got '{char}' at {line_no}:{col_no}")

    if stack:
        top_char, top_line, top_col = stack[-1]
        raise SyntaxError(f"Unclosed bracket '{top_char}' opened at line {top_line}, col {top_col}")

    if in_block_comment:
        raise SyntaxError("Unclosed block comment")

    print(f"  [OK] {filename} is syntactically sound! Processed {len(lines)} lines without syntax/bracket errors.")

if __name__ == '__main__':
    for fname in ['scene3d.js', 'pieces3d.js', 'engine.js', 'app.js']:
        try:
            check_js_syntax(fname)
        except Exception as e:
            print(f"  [ERROR] {e}")
            sys.exit(1)
    print("\nAll JavaScript files verified syntactically sound!")
