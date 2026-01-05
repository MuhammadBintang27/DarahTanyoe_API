-- Update generate_donor_code function to fix timeout issue
-- This function now generates unique codes with random suffix to prevent conflicts
-- when multiple donor confirmations are created simultaneously

CREATE OR REPLACE FUNCTION generate_donor_code()
RETURNS VARCHAR(12) AS $$
DECLARE
    code VARCHAR(12);
    exists BOOLEAN;
    random_suffix VARCHAR(2);
BEGIN
    LOOP
        -- Format: DN + YYMMDDHH + RR (12 chars: 2+8+2)
        -- RR = random 2-digit number (00-99) for uniqueness within same hour
        random_suffix := LPAD(FLOOR(RANDOM() * 100)::TEXT, 2, '0');
        code := 'DN' || TO_CHAR(NOW(), 'YYMMDDHH24') || random_suffix;
        SELECT EXISTS(SELECT 1 FROM donor_confirmations WHERE unique_code = code) INTO exists;
        EXIT WHEN NOT exists;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;
