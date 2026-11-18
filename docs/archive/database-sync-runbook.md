# Database Synchronization Runbook

> **Archived 2026-10-27.** The Data Sync page this guide supported was
> retired: it only stored per-table labels and nothing used them to copy
> data. To move data between installs, use Backup & Restore
> ([`../features/backup-restore.md`](../features/backup-restore.md)).
## CriteriaIQ Development → Production Database Sync

**Version:** 1.0  
**Last Updated:** October 1, 2025  
**Purpose:** Guide for synchronizing database schema and data from Development to Production environments

---

## Overview

This runbook provides step-by-step instructions for maintaining identical database structures and data between Development and Production environments during the testing phase. Once ready for production launch, we will define what data should be excluded from production.

### Sync Strategy
- **Direction:** Development → Production (one-way)
- **Frequency:** On-demand when pushing changes to production
- **Scope:** Complete schema + selective data tables
- **Method:** PostgreSQL dump/restore with table-level control

---

## Prerequisites

### Required Tools
- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`)
- Access credentials for both Development and Production databases
- Sufficient disk space for database dumps (estimate: 2x database size)

### Environment Variables
```bash
# Development Database
export DEV_DATABASE_URL="postgresql://user:password@dev-host:5432/dbname"

# Production Database  
export PROD_DATABASE_URL="postgresql://user:password@prod-host:5432/dbname"
```

### Pre-Flight Checklist
- [ ] Verify database credentials are valid
- [ ] Confirm sufficient disk space available
- [ ] Notify team of upcoming sync operation
- [ ] Backup production database before sync
- [ ] Verify no active users are in production system
- [ ] Check that development database is in a stable state

---

## Part 1: Schema Synchronization

Schema changes should be applied using migrations to ensure consistency.

### Step 1: Generate Migration (Development)

When schema changes are made in `shared/schema.ts`:

```bash
# Generate a new migration
npm run db:generate

# Review the generated SQL migration file in migrations/
# Verify it contains expected changes
```

### Step 2: Apply Migration to Development

```bash
# Apply migration to development database
npm run db:migrate

# Verify migration succeeded
psql $DEV_DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;"
```

### Step 3: Apply Same Migration to Production

```bash
# Copy migration files to production server
# Then apply the same migration to production

# On production server:
npm run db:migrate

# Verify migration succeeded
psql $PROD_DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;"
```

### Step 4: Verify Schema Parity

```bash
# Compare migration history
echo "Development migrations:"
psql $DEV_DATABASE_URL -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

echo "Production migrations:"
psql $PROD_DATABASE_URL -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

# Both should show identical migration history
```

---

## Part 2: Data Synchronization

Data is synchronized using selective table dumps based on sync categories.

### Understanding Sync Categories

Tables are categorized into three groups (see `database-sync-categories.md` for full list):

1. **Always Sync** - Configuration and reference data (e.g., compliance_regulations, users)
2. **Conditional Sync** - Transactional data needed during testing (e.g., projects, customers)  
3. **Never Sync** - Runtime/ephemeral data (e.g., sessions, audit_logins)

### Step 1: Create Production Backup

**CRITICAL:** Always backup production before restoring data.

```bash
# Create timestamped backup of production database
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -Fc --no-owner --no-privileges $PROD_DATABASE_URL > "prod_backup_$BACKUP_DATE.dump"

# Verify backup was created
ls -lh prod_backup_$BACKUP_DATE.dump
```

### Step 2: Export Development Data (Always Sync Tables)

Export configuration and reference tables that should always match:

```bash
# Export Always Sync tables from development
pg_dump $DEV_DATABASE_URL \
  --format=custom \
  --no-owner \
  --no-privileges \
  --table=compliance_regulations \
  --table=industry_compliance_regulations \
  --table=status_configs \
  --table=roles \
  --table=role_permissions \
  --table=user_permissions \
  --table=products \
  --table=criteria_library \
  --table=expected_outcomes \
  --table=action_items \
  --table=product_criteria \
  --table=criteria_outcomes \
  --table=outcome_actions \
  --table=industries \
  --table=execution_plans \
  --table=tags \
  --table=email_templates \
  --table=email_designs \
  --table=risk_criteria \
  --table=map_templates \
  --table=map_template_phases \
  --table=map_template_steps \
  --table=map_template_tasks \
  --table=end_date_flags \
  > dev_config_tables.dump
```

### Step 3: Export Development Data (Conditional Sync Tables)

Export transactional data needed for testing:

```bash
# Export Conditional Sync tables from development
pg_dump $DEV_DATABASE_URL \
  --format=custom \
  --no-owner \
  --no-privileges \
  --table=users \
  --table=customers \
  --table=projects \
  --table=project_templates \
  --table=success_criteria \
  --table=documents \
  --table=links \
  --table=custom_reports \
  --table=customer_access \
  --table=evaluation_requests \
  --table=evaluation_request_products \
  --table=map_phases \
  --table=map_steps \
  --table=map_tasks \
  --table=map_assignments \
  --table=map_links \
  --table=support_requests \
  > dev_transactional_tables.dump
```

### Step 4: Restore Data to Production

Restore the exported data to production:

```bash
# Restore configuration tables (Always Sync)
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname=$PROD_DATABASE_URL \
  dev_config_tables.dump

# Restore transactional tables (Conditional Sync)  
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname=$PROD_DATABASE_URL \
  dev_transactional_tables.dump
```

### Step 5: Sanitize Sensitive Data (Production)

After restore, clean up sensitive fields that should not be copied:

```bash
# Sanitize user security tokens and MFA data
psql $PROD_DATABASE_URL << EOF
-- Clear password reset tokens
UPDATE users SET reset_token = NULL, reset_token_expiry = NULL;

-- Clear MFA secrets (users will need to re-enroll)
UPDATE users SET totp_secret_enc = NULL WHERE totp_secret_enc IS NOT NULL;

-- Note: Keep approved users and roles intact
EOF
```

### Step 6: Verify Data Synchronization

Run validation checks to ensure data parity:

```bash
# Create validation script
cat > verify_sync.sql << 'EOF'
-- Compare row counts for key tables
SELECT 'compliance_regulations' as table_name, COUNT(*) as count FROM compliance_regulations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'execution_plans', COUNT(*) FROM execution_plans
UNION ALL
SELECT 'tags', COUNT(*) FROM tags
ORDER BY table_name;
EOF

# Run on Development
echo "=== Development Counts ==="
psql $DEV_DATABASE_URL -f verify_sync.sql

# Run on Production
echo "=== Production Counts ==="
psql $PROD_DATABASE_URL -f verify_sync.sql

# Counts should match for synced tables
```

### Step 7: Test Production Database

```bash
# Verify key constraints are intact
psql $PROD_DATABASE_URL << EOF
-- Check for foreign key violations
SELECT conrelid::regclass AS table_name,
       conname AS constraint_name
FROM pg_constraint
WHERE contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgconstraint = pg_constraint.oid
  );

-- Should return no rows if all constraints are valid
EOF
```

---

## Part 3: Post-Sync Verification

### Checklist

- [ ] Verify migration history matches between Dev and Prod
- [ ] Confirm row counts match for synced tables
- [ ] Test application login with existing user credentials
- [ ] Verify compliance regulations are present
- [ ] Check that execution plans are available
- [ ] Confirm customer and project data loaded correctly
- [ ] Test creating a new project in production
- [ ] Verify email templates are present
- [ ] Check MAP templates are loaded
- [ ] Review application logs for any database errors

### Rollback Procedure

If issues are discovered after sync:

```bash
# Restore from production backup
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname=$PROD_DATABASE_URL \
  prod_backup_$BACKUP_DATE.dump

# Verify restoration
psql $PROD_DATABASE_URL -c "\dt"
```

---

## Troubleshooting

### Issue: Foreign Key Constraint Violations

**Symptoms:** Restore fails with foreign key errors  
**Solution:** Restore tables in dependency order, or use `--disable-triggers` flag:

```bash
pg_restore --disable-triggers --dbname=$PROD_DATABASE_URL dev_tables.dump
```

### Issue: Permission Denied Errors

**Symptoms:** Cannot create or modify tables  
**Solution:** Ensure database user has sufficient privileges:

```bash
psql $PROD_DATABASE_URL << EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
EOF
```

### Issue: Disk Space Exhausted

**Symptoms:** pg_dump fails with "No space left on device"  
**Solution:** 
1. Free up disk space or use a different mount point
2. Use compressed format: `pg_dump -Fc` (already in commands above)
3. Dump to a different location with more space

### Issue: Migration Hash Mismatch

**Symptoms:** Drizzle reports different migration hashes  
**Solution:** Ensure identical migration files exist in both environments:

```bash
# Compare migration files
diff -r migrations/ /path/to/prod/migrations/
```

---

## Maintenance

### Regular Sync Schedule (Testing Phase)

- **Before Each Production Deployment:** Run full sync
- **After Major Schema Changes:** Verify migration applied to both environments
- **Weekly:** Verify row count parity for key tables

### When Ready for Production Launch

Once ready to go live with production:

1. **Define Production Data Reduction Strategy:**
   - Identify which test projects/customers to remove
   - Create cleanup scripts for non-production data
   - Archive development-only test data

2. **Stop Syncing Transactional Data:**
   - Only sync configuration tables (Always Sync category)
   - Production will have its own customer/project data

3. **Update This Runbook:**
   - Remove Conditional Sync tables from sync procedures
   - Add production-only data management guidelines

---

## Emergency Contacts

- **Database Administrator:** [Contact Info]
- **Development Team Lead:** [Contact Info]
- **System Administrator:** [Contact Info]

---

## Appendix: Quick Reference Commands

### Full Database Dump (Not Recommended for Production)

```bash
# Export entire development database
pg_dump -Fc --no-owner --no-privileges $DEV_DATABASE_URL > full_dev_dump.dump

# Restore entire database to production (DESTRUCTIVE)
pg_restore --clean --if-exists --dbname=$PROD_DATABASE_URL full_dev_dump.dump
```

### Check Database Size

```bash
# Check database size
psql $DEV_DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
psql $PROD_DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

### List All Tables

```bash
# List all tables in development
psql $DEV_DATABASE_URL -c "\dt"

# List all tables in production  
psql $PROD_DATABASE_URL -c "\dt"
```

---

**Document Version Control:**
- v1.0 (2025-10-01): Initial runbook creation
