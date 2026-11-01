-- =========================================================================
-- InfoTicket - Migração dos 5 Gatilhos Oficiais de Notificação por E-mail
-- Apontamento Exclusivo para Nuvem / Produção:
-- https://vrkhkifhkztttukuxbwz.supabase.co/functions/v1/send-notification
-- =========================================================================

-- Habilitar extensão pg_net para disparos HTTP assíncronos no Postgres
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- -------------------------------------------------------------------------
-- 1. GATILHO: Abertura de Chamado (Novo Ticket)
-- Disparo ao inserir novo registro na tabela tickets (AFTER INSERT)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_ticket_created_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'ticket_id', NEW.id,
    'company_id', NEW.company_id,
    'event_type', 'new_ticket',
    'user_id', COALESCE(NEW.cliente_id, auth.uid())
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_tickets_created ON public.tickets;
CREATE TRIGGER trg_tickets_created
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_created_notification();

-- -------------------------------------------------------------------------
-- 2. GATILHO: Alteração de Status
-- Disparo ao atualizar o campo 'status' na tabela tickets (AFTER UPDATE OF status)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_ticket_status_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_payload := jsonb_build_object(
      'ticket_id', NEW.id,
      'company_id', NEW.company_id,
      'event_type', 'status_change',
      'user_id', auth.uid()
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

DROP TRIGGER IF EXISTS trg_tickets_status_change ON public.tickets;
CREATE TRIGGER trg_tickets_status_change
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_status_notification();

-- -------------------------------------------------------------------------
-- 3. GATILHO: Atribuição de Operador
-- Disparo ao atualizar o campo 'operador_id' (AFTER UPDATE OF operador_id)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_ticket_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF (NEW.operador_id IS DISTINCT FROM OLD.operador_id AND NEW.operador_id IS NOT NULL) THEN
    v_payload := jsonb_build_object(
      'ticket_id', NEW.id,
      'company_id', NEW.company_id,
      'event_type', 'ticket_atribuido',
      'user_id', auth.uid(),
      'operador_id', NEW.operador_id
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

DROP TRIGGER IF EXISTS trg_tickets_operator_assigned ON public.tickets;
CREATE TRIGGER trg_tickets_operator_assigned
AFTER UPDATE OF operador_id ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ticket_assignment_notification();

-- -------------------------------------------------------------------------
-- 4. GATILHO: Nova Interação (Mensagens)
-- Disparo ao inserir mensagem pública (AFTER INSERT na tabela ticket_messages)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_ticket_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_chatwoot_payload JSONB;
BEGIN
  IF (NEW.is_internal_note = FALSE) THEN
    -- Canal WhatsApp Oficial
    IF (NEW.channel = 'whatsapp') THEN
      v_chatwoot_payload := jsonb_build_object(
        'message_id', NEW.id,
        'ticket_id', NEW.ticket_id,
        'company_id', NEW.company_id,
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

-- -------------------------------------------------------------------------
-- 5. GATILHO: Criação de Usuário (Onboarding)
-- Disparo ao inserir usuário na tabela auth.users ou profiles
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_user_welcome_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_company_id UUID;
  v_nome TEXT;
BEGIN
  BEGIN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_company_id := NULL;
  END;

  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  v_payload := jsonb_build_object(
    'user_id', NEW.id,
    'company_id', v_company_id,
    'event_type', 'welcome_email',
    'recipient_email', NEW.email,
    'recipient_name', v_nome
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auth_users_welcome ON auth.users;
CREATE TRIGGER trg_auth_users_welcome
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_user_welcome_notification();
