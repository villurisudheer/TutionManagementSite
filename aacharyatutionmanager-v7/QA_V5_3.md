# QA — Aacharya Tuition Manager v5.3 Excel Reliability Edition

## Root cause addressed

The prior lightweight XLSX writer emitted `mergeCells` before `autoFilter`. SpreadsheetML requires `autoFilter` to occur before `mergeCells` in worksheet XML. Some parsers tolerated the file, while strict Excel/Google Sheets import paths could report that the workbook was corrupted or needed repair.

## V5.3 XLSX changes

- Correct SpreadsheetML worksheet element order.
- Shared Strings (`xl/sharedStrings.xml`) instead of ad-hoc inline strings.
- Standard workbook theme relationship.
- Conventional DEFLATE ZIP packaging.
- Valid DOS ZIP timestamps.
- CRC and uncompressed-size verification.
- XML-invalid control-character stripping.
- Excel 32,767-character cell-text limit protection.
- Workbook filename: `Aacharya_Tuition_Master_v5_3.xlsx`.
- Existing 27-sheet comprehensive report model retained.

## Automated checks completed

- `npm test` passed end-to-end for login, intake, students, classes, attendance, fees, payer/receiver payments, tests, dashboard, Excel generation and logout.
- ZIP CRC/integrity validation passed.
- Built-in XLSX package validation passed for all 27 worksheets.
- Every XML part was checked as well-formed.
- The generated workbook was imported successfully by an independent spreadsheet parser and all 27 worksheet names were recovered.
- Executive Dashboard rendered successfully from the imported workbook.
- Formula-error scan found no `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` or `#N/A` errors in the validation workbook.

Because this environment cannot directly upload a file into the Google Sheets web UI or launch desktop Excel, V5.3 does not claim a literal UI-open test in those products. The package-level defects that could cause the repair warning were corrected and the file was independently parsed successfully.
