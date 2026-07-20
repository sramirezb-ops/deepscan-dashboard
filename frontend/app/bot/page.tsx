import { BotOperacion } from '@/components/views/BotOperacion';

// Hoja "Bot & Operación" — diagnóstico del bot de UChat (Ofero).
// Lee de Supabase (uchat_bot_diagnostics); gateada por el canal 'bot'.
export default function BotPage() {
  return <BotOperacion />;
}
