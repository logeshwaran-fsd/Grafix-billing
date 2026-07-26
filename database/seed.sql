-- Default settings
INSERT INTO settings (key, value) VALUES ('company_name', 'Grafix Impression') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('company_address', 'No. 32 Anderson Street, Parrys, Chennai-600001') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('company_phone', '+91 44 2536 1094') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('company_email', 'grafiximpressionparrys@gmail.com') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('company_gstin', '33AAAAA1111A1Z1') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('default_tax_rate', '18') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('currency_symbol', '₹') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('invoice_prefix', 'INV') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('low_stock_threshold', '10') ON CONFLICT (key) DO NOTHING;

-- Default categories
INSERT INTO categories (name, description) VALUES ('Polymer Plates', 'Printing polymer plates and accessories') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('Chemicals', 'Printing chemicals and solutions') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('Tapes & Adhesives', 'Double-sided tapes, foam tapes, adhesives') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('Stamps & Accessories', 'Rubber stamps, numbering machines, ink') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('Stationery', 'Office and printing stationery') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('Inks', 'Printing and stamp inks') ON CONFLICT (name) DO NOTHING;
INSERT INTO categories (name, description) VALUES ('General', 'General supplies') ON CONFLICT (name) DO NOTHING;

-- Sample products
INSERT INTO products (code, name, category_id, unit_price, cost_price, stock_quantity, reorder_level, unit) VALUES 
('001', 'Polymer Plate 2.84 B', 1, 250.00, 180.00, 1, 5, 'pcs'),
('002', 'Polymer Plate 2.84 V', 1, 250.00, 180.00, 166, 10, 'pcs'),
('003', 'Plating Washing Chem', 2, 350.00, 250.00, 2, 5, 'ltr'),
('004', 'NEGATIVE AGFA 50', 2, 1200.00, 900.00, 31, 5, 'pcs'),
('005', 'Gummed Foam GRAF', 3, 180.00, 120.00, 21, 10, 'pcs'),
('006', 'Negative AGFA', 2, 800.00, 600.00, 1, 5, 'pcs'),
('007', 'AB Lith', 2, 450.00, 320.00, 8, 5, 'pcs'),
('008', 'FIXER', 2, 300.00, 200.00, 0, 5, 'ltr'),
('009', 'Liquid Polymer GRAF', 2, 550.00, 400.00, 34, 5, 'ltr'),
('010', 'Liquid Polymer FAST', 2, 500.00, 380.00, 47, 5, 'ltr'),
('011', 'Liquid Polymer IDEA', 2, 480.00, 350.00, 9, 5, 'ltr'),
('012', 'Liquid Polymer MAC', 2, 520.00, 390.00, 34, 5, 'ltr'),
('013', 'BACK SHEET', 5, 150.00, 100.00, 73, 10, 'pcs'),
('014', 'APPLICATOR', 5, 80.00, 50.00, 187, 20, 'pcs'),
('015', 'Hardening Powder', 2, 200.00, 140.00, 0, 5, 'kg'),
('017', 'Liquid Washing Solvent', 2, 320.00, 220.00, 11, 5, 'ltr'),
('018', 'CUSHION Black', 3, 400.00, 280.00, 15, 5, 'pcs'),
('019', 'CUSHION Colour', 3, 450.00, 310.00, 2, 5, 'pcs'),
('020', 'OHP SHEET', 5, 120.00, 80.00, 471, 20, 'pcs'),
('021', 'TRACING SHEET', 5, 100.00, 70.00, 155, 20, 'pcs'),
('022', 'Common Seal Holder', 4, 250.00, 170.00, 29, 5, 'pcs'),
('023', 'EXPOSING VINLY M', 5, 380.00, 260.00, 47, 5, 'pcs'),
('024', 'FEVI BOND 40ML', 3, 60.00, 40.00, 15, 10, 'pcs'),
('025', 'DTP BOOSTER 100Z', 5, 500.00, 350.00, 1, 3, 'pcs'),
('026', 'FOAM TAPE 1"', 3, 90.00, 60.00, 20, 10, 'roll'),
('027', 'FOAM TAPE 2"', 3, 150.00, 100.00, 20, 10, 'roll'),
('028', 'Double Side Tis. Tape L', 3, 180.00, 120.00, 310, 20, 'roll'),
('029', 'Double Side Tis. Tape M', 3, 120.00, 80.00, 67, 20, 'roll'),
('030', 'Double Side Tis. Tape S', 3, 80.00, 50.00, 29, 20, 'roll'),
('031', 'GUMMING COUNCIL', 3, 200.00, 140.00, 9, 5, 'pcs'),
('032', 'TRODAT INK VIOLET', 6, 150.00, 100.00, 0, 5, 'pcs'),
('033', 'LIQUID BRUSH 100G', 2, 220.00, 150.00, 33, 5, 'pcs'),
('034', 'STAMP PAD INK', 6, 80.00, 50.00, 0, 10, 'pcs'),
('035', 'NUMBERING MACH S', 4, 800.00, 550.00, 1, 2, 'pcs'),
('036', 'NUMBERING MACH M', 4, 1200.00, 850.00, 0, 2, 'pcs'),
('037', 'Common Seal Holder B', 4, 300.00, 200.00, 10, 5, 'pcs'),
('038', 'NUMBERING MACH L', 4, 1500.00, 1050.00, 0, 2, 'pcs'),
('039', 'PEN STAMP', 4, 350.00, 240.00, 43, 5, 'pcs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO customers (name, phone, city) VALUES ('ZYBERDASH INFO', '9876543210', 'Chennai');
INSERT INTO customers (name, phone, city) VALUES ('Walk-in Customer', '', 'Chennai');
