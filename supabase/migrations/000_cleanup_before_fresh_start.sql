-- ========================================
-- PRE-RESET CLEANUP: Total Database Cleanup
-- Run this BEFORE 001_complete_schema.sql
-- ========================================
-- This ensures 100% fresh start by removing:
-- - All custom functions
-- - All triggers
-- - All views
-- - All tables (cascade)
-- - All types (cascade)
-- ========================================

-- Drop all custom functions in public schema (SKIP extension functions)
DO $$ 
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
        WHERE n.nspname = 'public'
          AND p.prokind IN ('f', 'p')  -- functions and procedures
          AND d.objid IS NULL  -- ✅ SKIP functions that belong to extensions (PostGIS, etc)
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
            func_record.schema_name, 
            func_record.function_name,
            func_record.args);
        RAISE NOTICE 'Dropped function: %.%(%)', func_record.schema_name, func_record.function_name, func_record.args;
    END LOOP;
END $$;

-- Drop all views (SKIP extension views)
DO $$ 
DECLARE
    view_record RECORD;
BEGIN
    FOR view_record IN 
        SELECT v.table_name 
        FROM information_schema.views v
        LEFT JOIN pg_depend d ON d.objid = (
            SELECT oid FROM pg_class WHERE relname = v.table_name AND relnamespace = 'public'::regnamespace
        ) AND d.deptype = 'e'
        WHERE v.table_schema = 'public'
          AND d.objid IS NULL  -- ✅ SKIP views that belong to extensions (PostGIS, etc)
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', view_record.table_name);
        RAISE NOTICE 'Dropped view: %', view_record.table_name;
    END LOOP;
END $$;

-- Drop all materialized views
DO $$ 
DECLARE
    mview_record RECORD;
BEGIN
    FOR mview_record IN 
        SELECT matviewname 
        FROM pg_matviews 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', mview_record.matviewname);
        RAISE NOTICE 'Dropped materialized view: %', mview_record.matviewname;
    END LOOP;
END $$;

-- Drop all tables (SKIP extension tables)
DO $$ 
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT t.tablename 
        FROM pg_tables t
        LEFT JOIN pg_depend d ON d.objid = (
            SELECT oid FROM pg_class WHERE relname = t.tablename AND relnamespace = 'public'::regnamespace
        ) AND d.deptype = 'e'
        WHERE t.schemaname = 'public'
          AND d.objid IS NULL  -- ✅ SKIP tables that belong to extensions (PostGIS spatial_ref_sys, etc)
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_record.tablename);
        RAISE NOTICE 'Dropped table: %', table_record.tablename;
    END LOOP;
END $$;

-- Drop all custom types (SKIP extension types)
DO $$ 
DECLARE
    type_record RECORD;
BEGIN
    FOR type_record IN 
        SELECT t.typname
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        LEFT JOIN pg_depend d ON d.objid = t.oid AND d.deptype = 'e'
        WHERE n.nspname = 'public'
          AND t.typtype = 'e'  -- enums only
          AND d.objid IS NULL  -- ✅ SKIP types that belong to extensions
    LOOP
        EXECUTE format('DROP TYPE IF EXISTS %I CASCADE', type_record.typname);
        RAISE NOTICE 'Dropped type: %', type_record.typname;
    END LOOP;
END $$;

-- Drop old migration tracking tables if any
DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP TABLE IF EXISTS _migrations CASCADE;

-- Verify cleanup
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    type_count INTEGER;
    view_count INTEGER;
BEGIN
    -- Count only custom (non-extension) objects
    SELECT COUNT(*) INTO table_count 
    FROM pg_tables t
    LEFT JOIN pg_depend d ON d.objid = (
        SELECT oid FROM pg_class WHERE relname = t.tablename AND relnamespace = 'public'::regnamespace
    ) AND d.deptype = 'e'
    WHERE t.schemaname = 'public' AND d.objid IS NULL;
    
    SELECT COUNT(*) INTO function_count 
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') AND d.objid IS NULL;
    
    SELECT COUNT(*) INTO type_count 
    FROM pg_type t 
    JOIN pg_namespace n ON t.typnamespace = n.oid 
    LEFT JOIN pg_depend d ON d.objid = t.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND t.typtype = 'e' AND d.objid IS NULL;
    
    SELECT COUNT(*) INTO view_count 
    FROM information_schema.views v
    LEFT JOIN pg_depend d ON d.objid = (
        SELECT oid FROM pg_class WHERE relname = v.table_name AND relnamespace = 'public'::regnamespace
    ) AND d.deptype = 'e'
    WHERE v.table_schema = 'public' AND d.objid IS NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ CLEANUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Custom tables remaining: %', table_count;
    RAISE NOTICE 'Custom functions remaining: %', function_count;
    RAISE NOTICE 'Custom types remaining: %', type_count;
    RAISE NOTICE 'Custom views remaining: %', view_count;
    RAISE NOTICE '';
    
    IF table_count = 0 AND function_count = 0 AND type_count = 0 AND view_count = 0 THEN
        RAISE NOTICE '🎉 Database is completely clean!';
        RAISE NOTICE '✅ Ready to run 001_complete_schema.sql';
        RAISE NOTICE '📌 PostGIS extension preserved (spatial_ref_sys, geometry_columns, etc)';
    ELSE
        RAISE WARNING '⚠️  Some custom objects still remain: T:%, F:%, Ty:%, V:%', table_count, function_count, type_count, view_count;
    END IF;
    
    RAISE NOTICE '========================================';
END $$;
