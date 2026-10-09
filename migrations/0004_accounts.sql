create table if not exists accounts (
  player_id uuid primary key references players(id) on delete cascade,
  email text not null,
  password_hash text not null,
  date_of_birth date not null,
  age_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists accounts_email_lower_idx on accounts (lower(email));
