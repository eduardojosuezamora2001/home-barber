-- Projects initialized before the core migration used public as the default extension schema.
alter extension btree_gist set schema extensions;
