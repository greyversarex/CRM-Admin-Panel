# Rotation ключа шифрования integration credentials

`integration_credentials.cipher_text` содержит AES-256-GCM ciphertext. Production
API требует `INTEGRATIONS_ENCRYPTION_KEY` и не стартует с известным dev fallback.
Новые значения имеют формат `v1:<key-id>:<payload>`; key id — короткий SHA-256
fingerprint, а не сам ключ.

## Переменные

- `INTEGRATIONS_ENCRYPTION_KEY` — current 32-byte key (64-char hex или base64).
- `INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS` — временный CSV предыдущих keys, только
  для чтения legacy/old ciphertext во время rotation.

Нельзя повторно использовать `SESSION_SECRET`, `DDEX_INBOUND_SECRET` или хранить
значения keys в Git, логах и audit trail.

## Безопасная ротация

1. Сделать backup БД и проверить restore procedure.
2. Сгенерировать новый key: `openssl rand -hex 32`.
3. Запустить API с новым key в `INTEGRATIONS_ENCRYPTION_KEY`, а старым — в
   `INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS`. Не удалять старый key на этом шаге.
4. Выполнить dry-run:

   ```bash
   pnpm --filter @workspace/api-server rotate:integration-credentials
   # Docker runtime image:
   docker compose exec api node artifacts/api-server/dist/rotate-integration-credentials.mjs
   ```

   Dry-run сначала проверяет расшифровку всех строк и не изменяет БД. Любая
   нерасшифровываемая запись завершает процесс с ошибкой и списком numeric IDs.

5. Применить атомарную ротацию:

   ```bash
   pnpm --filter @workspace/api-server rotate:integration-credentials -- --apply
   # Docker runtime image:
   docker compose exec api node artifacts/api-server/dist/rotate-integration-credentials.mjs --apply
   ```

   Все новые ciphertext подготавливаются до transaction. Затем строки и их
   system audit records обновляются в одной DB transaction — частичного результата
   быть не может. Значения plaintext/ciphertext не выводятся.

6. Повторить dry-run: `pending` должен быть `0`. Проверить соединения интеграций.
7. Удалить `INTEGRATIONS_ENCRYPTION_PREVIOUS_KEYS` и перезапустить API.

## Миграция известного legacy fallback

Если production когда-либо шифровал credentials без env key, старые данные
скомпрометированы известным source fallback. Его 32-byte hash нужно временно
передать как previous key, выполнить процедуру выше и затем немедленно удалить:

```bash
printf %s 'tajikmusic-dev-fallback-key-do-not-use-in-prod' | sha256sum
```

После rotation также ротировать сами внешние API tokens/passwords, потому что
известный fallback не обеспечивал конфиденциальность.

## Rollback

Не уничтожать старый key до финальной проверки. Если нужен rollback приложения,
запустить его со старым current key и новым key в previous ring: обе версии
ciphertext останутся читаемыми. После стабилизации повторить controlled rotation.
