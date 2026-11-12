-- ============================================================================
-- ARCHIVO: sql/03_funcion_desencriptar_texto.sql
-- DESCRIPCIÓN: Funciones en PostgreSQL / Supabase (`public.desencriptar_texto`,
--              `public.encriptar_texto` y actualización de `public.decrypt_data` /
--              `public.encrypt_data`) siguiendo exactamente el modelo de
--              encriptación/desencriptación simétrica de la aplicación:
--              Prefijo `ENCv1:` + Base64(UTF-8 bytes XOR clave `disp_client_sym_layer_2026`),
--              con soporte adicional de respaldo para `pgcrypto` (`pgp_sym_decrypt`).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Función de base de datos para desencriptar valores de texto (`ENCv1:` XOR + Base64)
CREATE OR REPLACE FUNCTION public.desencriptar_texto(
    p_cipher_text TEXT,
    p_secret_key TEXT DEFAULT 'disp_client_sym_layer_2026'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
    v_b64 TEXT;
    v_cipher_bytes BYTEA;
    v_key_bytes BYTEA;
    v_result_bytes BYTEA;
    v_data_len INTEGER;
    v_key_len INTEGER;
    i INTEGER;
BEGIN
    IF p_cipher_text IS NULL OR p_cipher_text = '' THEN
        RETURN p_cipher_text;
    END IF;

    v_key := COALESCE(NULLIF(p_secret_key, ''), 'disp_client_sym_layer_2026');

    -- Modelo principal de la aplicación: prefijo 'ENCv1:' + Base64(UTF-8 XOR clave)
    IF left(p_cipher_text, 6) = 'ENCv1:' THEN
        BEGIN
            v_b64 := substring(p_cipher_text FROM 7);
            v_cipher_bytes := decode(v_b64, 'base64');
            v_key_bytes := convert_to(v_key, 'UTF8');
            v_data_len := octet_length(v_cipher_bytes);
            v_key_len := octet_length(v_key_bytes);

            IF v_data_len = 0 OR v_key_len = 0 THEN
                RETURN '';
            END IF;

            v_result_bytes := v_cipher_bytes;

            FOR i IN 0 .. (v_data_len - 1) LOOP
                v_result_bytes := set_byte(
                    v_result_bytes,
                    i,
                    get_byte(v_cipher_bytes, i) # get_byte(v_key_bytes, mod(i, v_key_len))
                );
            END LOOP;

            RETURN convert_from(v_result_bytes, 'UTF8');
        EXCEPTION WHEN OTHERS THEN
            RETURN p_cipher_text;
        END;
    END IF;

    -- Respaldo compatible con pgcrypto AES-256 (si algún valor fue cifrado con pgp_sym_encrypt)
    BEGIN
        RETURN pgp_sym_decrypt(
            decode(p_cipher_text, 'base64'),
            COALESCE(NULLIF(p_secret_key, ''), 'disp_default_sym_key_2026_secure')
        );
    EXCEPTION WHEN OTHERS THEN
        -- Si ya es texto plano legible, devolverlo sin cambios
        RETURN p_cipher_text;
    END;
END;
$$;

-- 2. Función de base de datos para encriptar valores de texto bajo el mismo modelo (`ENCv1:`)
CREATE OR REPLACE FUNCTION public.encriptar_texto(
    p_plain_text TEXT,
    p_secret_key TEXT DEFAULT 'disp_client_sym_layer_2026'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key TEXT;
    v_data_bytes BYTEA;
    v_key_bytes BYTEA;
    v_result_bytes BYTEA;
    v_data_len INTEGER;
    v_key_len INTEGER;
    i INTEGER;
BEGIN
    IF p_plain_text IS NULL OR p_plain_text = '' THEN
        RETURN p_plain_text;
    END IF;

    -- Evitar doble encriptación si ya tiene el prefijo ENCv1:
    IF left(p_plain_text, 6) = 'ENCv1:' THEN
        RETURN p_plain_text;
    END IF;

    v_key := COALESCE(NULLIF(p_secret_key, ''), 'disp_client_sym_layer_2026');
    v_data_bytes := convert_to(p_plain_text, 'UTF8');
    v_key_bytes := convert_to(v_key, 'UTF8');
    v_data_len := octet_length(v_data_bytes);
    v_key_len := octet_length(v_key_bytes);

    IF v_data_len = 0 OR v_key_len = 0 THEN
        RETURN '';
    END IF;

    v_result_bytes := v_data_bytes;

    FOR i IN 0 .. (v_data_len - 1) LOOP
        v_result_bytes := set_byte(
            v_result_bytes,
            i,
            get_byte(v_data_bytes, i) # get_byte(v_key_bytes, mod(i, v_key_len))
        );
    END LOOP;

    -- Eliminar posibles saltos de línea que encode(..., 'base64') agrega cada 76 caracteres
    RETURN 'ENCv1:' || regexp_replace(encode(v_result_bytes, 'base64'), '[\r\n]+', '', 'g');
END;
$$;

-- 3. Sincronizar los alias `public.decrypt_data` y `public.encrypt_data` con este modelo
CREATE OR REPLACE FUNCTION public.decrypt_data(
    p_cipher_text TEXT,
    p_secret_key TEXT DEFAULT 'disp_client_sym_layer_2026'
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT public.desencriptar_texto(p_cipher_text, p_secret_key);
$$;

CREATE OR REPLACE FUNCTION public.encrypt_data(
    p_plain_text TEXT,
    p_secret_key TEXT DEFAULT 'disp_client_sym_layer_2026'
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT public.encriptar_texto(p_plain_text, p_secret_key);
$$;

GRANT EXECUTE ON FUNCTION public.desencriptar_texto(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encriptar_texto(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_data(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_data(TEXT, TEXT) TO anon, authenticated;

