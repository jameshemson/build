#!/bin/sh
# shape-scan: mechanical shape metrics over the files passed as arguments.
# Invoke as: sh shape-scan.sh FILE...
#
# Output, one record per line:
#   FUNCTION path:start_line:length   for each detected function longer than 80 lines
#   UNSUPPORTED path                  extension has no supported scanner
#   MISSING path                      path does not exist
#   SUMMARY functions=N over80=N over150=N max=N
#   SUMMARY magic_numbers=N           numeric literals outside {0,1,2,10,100,1000}
#                                     in non-test supported files
#
# Function detection is a brace-depth heuristic for brace-style languages.
# It does not parse strings or comments; treat results as measurements to
# interpret, not a pass/fail gate. Always exits 0.

functions=0
over80=0
over150=0
max=0
magic=0

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "MISSING $f"
    continue
  fi

  case "$f" in
    *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.go|*.java|*.c|*.h|*.cpp|*.cc|*.rs|*.swift|*.kt) ;;
    *)
      echo "UNSUPPORTED $f"
      continue
      ;;
  esac

  res=$(awk -v path="$f" '
    BEGIN { depth = 0; infunc = 0; nf = 0; o80 = 0; o150 = 0; mx = 0 }
    {
      line = $0
      if (!infunc) {
        if ((line ~ /(^|[^A-Za-z0-9_$])function([^A-Za-z0-9_$]|$)/ && line ~ /\{/) ||
            line ~ /=>[[:space:]]*\{[[:space:]]*$/ ||
            (line ~ /^[[:space:]]*(func|fn)[[:space:]]/ && line ~ /\{/) ||
            line ~ /^[[:space:]]*[A-Za-z_$][A-Za-z0-9_$ ]*\([^;]*\)[[:space:]]*\{[[:space:]]*$/) {
          infunc = 1
          start = NR
          startdepth = depth
        }
      }
      opens = gsub(/\{/, "{", line)
      closes = gsub(/\}/, "}", line)
      depth += opens - closes
      if (infunc && depth <= startdepth) {
        len = NR - start + 1
        nf++
        if (len > 80) { o80++; print "FUNCTION " path ":" start ":" len }
        if (len > 150) o150++
        if (len > mx) mx = len
        infunc = 0
      }
    }
    END { print "__COUNTS " nf " " o80 " " o150 " " mx }
  ' "$f")

  printf '%s\n' "$res" | grep '^FUNCTION ' 2>/dev/null
  counts=$(printf '%s\n' "$res" | sed -n 's/^__COUNTS //p')
  nf=0; o80=0; o150=0; mx=0
  IFS=' ' read -r nf o80 o150 mx <<EOF
$counts
EOF
  functions=$((functions + nf))
  over80=$((over80 + o80))
  over150=$((over150 + o150))
  [ "$mx" -gt "$max" ] && max=$mx

  case "$f" in
    *.test.*|*.spec.*|*__tests__*|*_test.*) ;;
    *)
      m=$(awk '
        {
          line = $0
          while (match(line, /[0-9]+(\.[0-9]+)?/)) {
            tok = substr(line, RSTART, RLENGTH)
            before = (RSTART > 1) ? substr(line, RSTART - 1, 1) : ""
            rest = RSTART + RLENGTH
            after = (rest <= length(line)) ? substr(line, rest, 1) : ""
            if (before !~ /[A-Za-z0-9_.$]/ && after !~ /[A-Za-z0-9_.]/ &&
                tok != "0" && tok != "1" && tok != "2" &&
                tok != "10" && tok != "100" && tok != "1000") c++
            line = substr(line, rest)
          }
        }
        END { print c + 0 }
      ' "$f")
      magic=$((magic + m))
      ;;
  esac
done

echo "SUMMARY functions=$functions over80=$over80 over150=$over150 max=$max"
echo "SUMMARY magic_numbers=$magic"
exit 0
