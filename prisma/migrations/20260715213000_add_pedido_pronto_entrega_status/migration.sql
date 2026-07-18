DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_value.enumtypid = enum_type.oid
    WHERE enum_type.typname = 'StatusPedido'
      AND enum_value.enumlabel = 'PRONTO_ENTREGA'
  ) THEN
    ALTER TYPE "StatusPedido" ADD VALUE 'PRONTO_ENTREGA' AFTER 'PREPARACAO';
  END IF;
END $$;
