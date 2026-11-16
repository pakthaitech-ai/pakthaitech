-- PakThai Tech fresh-start cleanup, 2026-10-11.
-- Archive first. These were old unverified Thailand leads / prepared-only seller outreach.
-- Do NOT delete today's external_prospects or buyer_prospects.
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_sellers AS SELECT * FROM sellers WHERE id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_seller_offers AS SELECT * FROM seller_offers WHERE seller_id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_supplier_offers AS SELECT * FROM supplier_offers WHERE seller_id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_seller_history AS SELECT * FROM seller_history WHERE seller_id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_opportunities AS SELECT * FROM opportunities WHERE seller_id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_buyer_matches AS SELECT * FROM buyer_matches WHERE seller_id BETWEEN 3 AND 7;
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_negotiations AS SELECT * FROM negotiations WHERE seller_id BETWEEN 3 AND 7 OR opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_purchase_tracking AS SELECT * FROM purchase_tracking WHERE seller_id BETWEEN 3 AND 7 OR opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_owner_approvals AS SELECT * FROM owner_approvals WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_quotations AS SELECT * FROM quotations WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_orders AS SELECT * FROM orders WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
CREATE TABLE IF NOT EXISTS backup_market_reset_20261011_notifications AS SELECT * FROM notifications WHERE (related_type='seller_lead' AND related_id BETWEEN 3 AND 7) OR (related_type='supplier_outreach' AND recipient IN ('luna@panyatech.co','sale@supreme.co.th'));
-- Remove old seller records and their active history; preserve today's prospect intake.
DELETE FROM owner_approvals WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
DELETE FROM purchase_tracking WHERE seller_id BETWEEN 3 AND 7 OR opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
DELETE FROM negotiations WHERE seller_id BETWEEN 3 AND 7 OR opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
DELETE FROM quotations WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
DELETE FROM orders WHERE opportunity_id IN (SELECT id FROM opportunities WHERE seller_id BETWEEN 3 AND 7);
DELETE FROM seller_history WHERE seller_id BETWEEN 3 AND 7;
DELETE FROM supplier_offers WHERE seller_id BETWEEN 3 AND 7;
DELETE FROM seller_offers WHERE seller_id BETWEEN 3 AND 7;
DELETE FROM buyer_matches WHERE seller_id BETWEEN 3 AND 7;
DELETE FROM opportunities WHERE seller_id BETWEEN 3 AND 7;
DELETE FROM notifications WHERE (related_type='seller_lead' AND related_id BETWEEN 3 AND 7) OR (related_type='supplier_outreach' AND recipient IN ('luna@panyatech.co','sale@supreme.co.th'));
DELETE FROM sellers WHERE id BETWEEN 3 AND 7;
