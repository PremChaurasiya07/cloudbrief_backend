-- Table for raw messages/memories
create table memory_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users,
  content text,
  type text, -- email, message, etc.
  source text, -- gmail, whatsapp
  created_at timestamp default now()
);

-- Table for daily AI-generated briefs
create table memory_briefs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users,
  brief text,
  created_at timestamp default now()
);
