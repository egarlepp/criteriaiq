# Success Criteria CSV Import Guide

## Overview

The CSV Import feature allows administrators to bulk import Solutions, Success Criteria, Expected Outcomes, and Actions Taken into the Success Criteria Library. This guide covers the CSV format, requirements, edge cases, and best practices.

## CSV Format Specification

### Required Columns

Your CSV file must include the following columns in this exact order:

```
Category,Name,Description,Solutions,Abbreviation,Tags
```

### Column Descriptions

| Column | Required | Applies To | Description |
|--------|----------|------------|-------------|
| **Category** | Yes | All | Type of item: `Solution`, `Criteria`, `Outcome`, or `Action` |
| **Name** | Yes | All | Unique name for the item |
| **Description** | No | All | Detailed description of the item |
| **Solutions** | No | Criteria, Outcomes, Actions | Comma-separated list of solution names this item applies to. Leave blank for "All Solutions" |
| **Abbreviation** | No | Solutions only | Short abbreviation for the solution (e.g., "NA" for Acme Auditor) |
| **Tags** | No | Solutions only | Comma-separated list of tags for categorization |

### Important Notes

- **Solutions only** have Abbreviation and Tags fields. Leave these blank for Criteria, Outcomes, and Actions.
- **Category** values are case-sensitive. Use exact capitalization: `Solution`, `Criteria`, `Outcome`, `Action`
- **Name** must be unique within each category. Duplicate names will update existing items.

## Category-Specific Requirements

### Solutions

Solutions are products or offerings in your portfolio. They must be created **before** referencing them in Criteria, Outcomes, or Actions.

**Required Fields:**
- Category: `Solution`
- Name

**Optional Fields:**
- Description
- Abbreviation (short code like "NA", "DLP")
- Tags (comma-separated)

**Example:**
```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Solution","Acme Auditor","Advanced security analytics platform","","NA","Security,Compliance"
```

### Criteria (Success Criteria)

Success Criteria define measurable validation goals.

**Required Fields:**
- Category: `Criteria`
- Name

**Optional Fields:**
- Description
- Solutions (comma-separated solution names, or blank for "All Solutions")

**Example:**
```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Criteria","User Activity Monitoring","Track and analyze user behavior across systems","Acme Auditor","",""
```

### Outcomes (Expected Outcomes)

Expected Outcomes describe the desired results from validation activities.

**Required Fields:**
- Category: `Outcome`
- Name

**Optional Fields:**
- Description
- Solutions (comma-separated solution names, or blank for "All Solutions")

**Example:**
```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Outcome","100% Login Activity Captured","All user login events are recorded and analyzed","Acme Auditor","",""
```

### Actions (Actions Taken)

Actions Taken represent specific implementation steps.

**Required Fields:**
- Category: `Action`
- Name

**Optional Fields:**
- Description
- Solutions (comma-separated solution names, or blank for "All Solutions")

**Example:**
```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Action","Configure Login Auditing","Set up comprehensive login event monitoring","Acme Auditor","",""
```

## Multi-Solution Assignment

Criteria, Outcomes, and Actions can be assigned to specific solutions or apply to all solutions.

### Assigning to Specific Solutions

To link an item to specific solutions, list the solution names separated by commas in the **Solutions** column:

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Criteria","Data Classification","Identify and classify sensitive data","Acme Auditor,Data Loss Prevention","",""
```

**Important:** The solution names must match exactly (case-insensitive) with existing Solutions in your library. If a referenced solution doesn't exist, the row will be skipped with an error message.

### "All Solutions" Behavior

To make an item apply to **all solutions** (both current and future), leave the **Solutions** column empty:

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Criteria","Shared Success Metric","This applies to all solutions","","",""
```

Items with no solution assignment will be available for all projects regardless of which solution is selected.

## Using Tags

Tags help categorize and filter Solutions. The Tags column accepts comma-separated values.

### Downloading the Tags List

Before importing, you can download the current tags list to see available tags:

1. Open the CSV Import dialog
2. Click **Download Tags List**
3. Reference the downloaded `tags_list.csv` for existing tag names, descriptions, and colors

### Tag Format

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Solution","Acme Auditor","Advanced security analytics","","NA","Security,Compliance,Auditing"
```

**Best Practices:**
- Use existing tags when possible for consistency
- Separate multiple tags with commas (no spaces after commas)
- Tags are case-sensitive
- New tags will be created automatically if they don't exist

## Edge Cases and Special Characters

### Embedded Quotes

If your text contains quotation marks, use double quotes to escape them:

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Criteria","Customer ""Success"" Metric","This has ""quoted"" text in the description","","",""
```

**Result:** Description will be: `This has "quoted" text in the description`

### Commas in Text

To include commas in your descriptions, wrap the entire field in quotes:

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Solution","Multi-Feature Product","Includes auditing, monitoring, and reporting features","","MFP","Security"
```

### Line Breaks

Line breaks within CSV cells are not recommended. Keep descriptions on a single line or use alternative formatting.

### Special Characters

Most special characters (!, @, #, $, %, etc.) are supported in any field when the field is properly quoted.

## Import Behavior

### Creating New Items

- If an item with the same **Name** doesn't exist in that **Category**, a new item is created
- All specified fields are populated

### Updating Existing Items

- If an item with the same **Name** already exists in that **Category**, the existing item is updated
- Description, Solutions assignment, Abbreviation, and Tags are updated to match the CSV
- The import summary will show the item as "Updated"

### Skipping Duplicates

- If the existing item matches the CSV data exactly (no changes), it's counted as "Skipped"
- No database modification occurs for skipped items

### Error Handling

The import continues processing even if individual rows have errors. Common errors:

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required fields | Category or Name is blank | Add the missing data |
| Invalid Category | Category is not Solution/Criteria/Outcome/Action | Use exact capitalization |
| Solution not found | Referenced solution doesn't exist yet | Create Solutions first, then import Criteria/Outcomes/Actions |
| Column count mismatch | Row has wrong number of columns | Check for unescaped quotes or extra commas |

## Step-by-Step Workflow

### 1. Download the CSV Template

1. Navigate to **Admin** → **Success Criteria Library**
2. Click **Import CSV** button
3. Click **Download CSV Template**
4. Open the template in your preferred spreadsheet application or text editor

### 2. Download the Tags List (Optional)

1. In the Import dialog, click **Download Tags List**
2. Review available tags to maintain consistency
3. Reference tag names when populating the Tags column

### 3. Prepare Your Data

**Important Order:**
1. Create **Solutions** first (rows with `Category = Solution`)
2. Then create **Criteria, Outcomes, and Actions** (they can reference the solutions)

**Example Import Order:**

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Solution","Acme Auditor","Advanced security analytics","","NA","Security,Compliance"
"Solution","Data Loss Prevention","Protect sensitive data","","DLP","Security,Data Protection"
"Criteria","User Activity Monitoring","Track user behavior","Acme Auditor","",""
"Outcome","100% Login Activity Captured","All login events recorded","Acme Auditor","",""
"Action","Configure Login Auditing","Set up login monitoring","Acme Auditor","",""
```

### 4. Validate Your CSV

Before importing, check:
- ✅ Header row matches exactly: `Category,Name,Description,Solutions,Abbreviation,Tags`
- ✅ All Solutions are defined before being referenced
- ✅ Category values use correct capitalization
- ✅ Special characters and quotes are properly escaped
- ✅ No extra blank rows at the end

### 5. Import the File

1. Click **Import CSV** button
2. Click **Select CSV File** and choose your file
3. Review the file name and size
4. Click **Import CSV**
5. Wait for processing (progress bar will show)

### 6. Review Import Results

The import summary shows:

**For each category:**
- **Created:** New items added
- **Updated:** Existing items modified
- **Skipped:** Items unchanged (exact duplicates)

**Errors:** Any rows that failed to process with specific error messages

### 7. Verify Data

After import:
1. Check each tab (Solutions, Criteria, Outcomes, Actions)
2. Verify solution assignments are correct
3. Confirm tags appear correctly on Solutions
4. Review any error messages and re-import corrected rows if needed

## Troubleshooting

### "Solution not found" Errors

**Problem:** Importing Criteria/Outcomes/Actions that reference non-existent Solutions

**Solution:** 
1. Import all Solutions first
2. Then import Criteria, Outcomes, and Actions
3. Or combine in one file with Solutions at the top

### Incorrect Column Count

**Problem:** "Missing required fields" or parsing errors

**Solution:**
- Check for unescaped quotes in your data
- Ensure all commas within text are inside quoted fields
- Verify no extra commas at the end of rows

### Items Not Appearing

**Problem:** Imported items don't show in the UI

**Solution:**
- Check the Category spelling (case-sensitive)
- Verify the import summary showed "Created" not "Skipped"
- Refresh the page
- Check the Errors section of the import results

### Tags Not Applying

**Problem:** Tags column data isn't creating tags on Solutions

**Solution:**
- Ensure you're applying Tags to Solutions only (not Criteria/Outcomes/Actions)
- Check for extra spaces after commas in tag list
- Verify tag names don't contain special characters that could break parsing

## Best Practices

1. **Start Small:** Import a small test file first to verify format
2. **Solutions First:** Always create Solutions before referencing them
3. **Use Existing Tags:** Download the Tags List to maintain consistency
4. **Validate Locally:** Open your CSV in Excel/Google Sheets to check formatting
5. **Backup First:** Consider exporting current data before large imports
6. **Incremental Updates:** For large datasets, import in batches of 50-100 rows
7. **Test Edge Cases:** Try embedded quotes and special characters on test data first

## Example CSV File

Here's a complete example showing all features:

```csv
Category,Name,Description,Solutions,Abbreviation,Tags
"Solution","Acme Auditor","Advanced security analytics platform","","NA","Security,Compliance"
"Solution","Data Loss Prevention","Protect sensitive data from unauthorized access","","DLP","Security,Data Protection"
"Criteria","User Activity Monitoring","Track and analyze user behavior across systems","Acme Auditor","",""
"Criteria","Data Classification","Identify and classify sensitive data","Acme Auditor,Data Loss Prevention","",""
"Criteria","Shared Success Metric","This applies to all solutions","","",""
"Outcome","100% Login Activity Captured","All user login events are recorded and analyzed","Acme Auditor","",""
"Outcome","Sensitive Data Identified","All PII and confidential data is properly tagged","Data Loss Prevention","",""
"Action","Configure Login Auditing","Set up comprehensive login event monitoring","Acme Auditor","",""
"Action","Implement Data Tagging","Deploy automated data classification rules","Data Loss Prevention","",""
```

## Support

For additional help:
- Review the Success Criteria Library documentation
- Contact your system administrator
- Check the import error messages for specific guidance
