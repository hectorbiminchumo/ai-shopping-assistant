-- Función pgvector para búsqueda semántica por similitud coseno.
-- Ejecutar en Supabase → SQL Editor.
-- Usada por RetrievalService.search() vía supabase.rpc("match_products", {...})

CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1024),
  match_count     int,
  filter_category text    DEFAULT NULL,
  filter_price_max numeric DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  medusa_product_id text,
  title             text,
  description       text,
  category          text,
  tags              text[],
  price_min         numeric,
  price_max         numeric,
  thumbnail_url     text,
  similarity        float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id,
    pe.medusa_product_id,
    pe.title,
    pe.description,
    pe.category,
    pe.tags,
    pe.price_min,
    pe.price_max,
    pe.thumbnail_url,
    -- <=> es distancia coseno en pgvector; 1 - distancia = similitud
    (1 - (pe.embedding <=> query_embedding))::float AS similarity
  FROM product_embeddings pe
  WHERE
    pe.embedding IS NOT NULL
    AND (filter_category  IS NULL OR pe.category  = filter_category)
    AND (filter_price_max IS NULL OR pe.price_min <= filter_price_max)
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
