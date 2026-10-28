-- An absent accounting INN stays empty; imported parties are never guessed or
-- enrolled by telephone. Preserve uniqueness for actual, supplied INNs.
DROP INDEX warehouse.tenants_inn_unique;
CREATE UNIQUE INDEX tenants_inn_unique ON warehouse.tenants (inn) WHERE inn <> '';
