-- =========================================================================
-- InfoTicket - Migração: Flag is_imported em ticket_messages (Anti-Loop WhatsApp)
-- Data: 2026-11-04
-- =========================================================================

-- 1. Adiciona a coluna is_imported na tabela public.ticket_messages
ALTER TABLE public.ticket_messages
ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Atualiza a função do gatilho para ignorar mensagens importadas (is_imported = TRUE)
CREATE OR REPLACE FUNCTION public.trigger_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_chatwoot_payload JSONB;
BEGIN
  -- Ignora notas internas E mensagens importadas do histórico do WhatsApp (evita loop de reenvio)
  IF (NEW.is_internal_note = FALSE AND COALESCE(NEW.is_imported, FALSE) = FALSE) THEN
    -- Canal WhatsApp Oficial
    IF (NEW.channel = 'whatsapp') THEN
      v_chatwoot_payload := jsonb_build_object(
        'message_id', NEW.id,
        'ticket_id', NEW.ticket_id,
        'company_id', NEW.company_id,
        'is_imported', COALESCE(NEW.is_imported, FALSE),
        'template_name', NEW.whatsapp_template_name,
        'variables', NEW.whatsapp_template_variables,
        'content', NEW.content
      );

      BEGIN
        PERFORM net.http_post(
          url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-whatsapp-official',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := v_chatwoot_payload
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Canal E-mail via send-notification
    v_payload := jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'company_id', NEW.company_id,
      'event_type', 'new_message',
      'message_id', NEW.id,
      'user_id', NEW.user_id
    );

    BEGIN
      PERFORM net.http_post(
        url := 'https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ticket_messages_new_interaction ON public.ticket_messages;
CREATE TRIGGER trg_ticket_messages_new_interaction
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_message_notification();

