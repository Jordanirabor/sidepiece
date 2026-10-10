-- M2 / ADR 0007: the economy moves from $ to naira (₦) scale.
-- Existing balances are rescaled x250 (old drink $15 ≈ ₦3,750; shift $80 ≈ ₦20,000).
-- New players get life::STARTING_MONEY (₦50,000), which the API inserts explicitly; the default mirrors it.
update player_life set money = money * 250;
alter table player_life alter column money set default 50000;
