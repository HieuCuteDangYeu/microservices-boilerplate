# QWEN.md — Project Rules & Conventions

> Auto-generated from reverse-engineering the codebase. These rules reflect how the code is *actually* written.

---

## Architecture: Clean Architecture (Strict)

All backend services (`auth-service`, `user-service`, and any new service) MUST follow this three-layer structure:

```
src/
├── domain/
│   ├── entities/        # Entity classes (plain TS classes, no decorators)
│   ├── errors/          # Domain-specific error classes
│   └── interfaces/      # Repository & service interfaces (ports)
├── application/
│   └── use-cases/       # One class per use case, single execute() method
└── infrastructure/
    ├── controllers/     # @MessagePattern / @EventPattern handlers
    ├── adapters/        # Implement domain interfaces via RMQ ClientProxy
    ├── repositories/    # Implement domain repository interfaces (Prisma/Redis)
    ├── prisma/          # PrismaService (extends PrismaClient)
    ├── services/        # External service implementations (R2, etc.)
    └── jobs/            # Scheduled tasks (@Cron)
```

### Dependency Rule (NEVER violate)

- **Domain** imports NOTHING from Application or Infrastructure
- **Application** imports ONLY from Domain
- **Infrastructure** imports from Domain and Application

### No MVC

This project does NOT use MVC. There are no models, views, or controller-service-repository patterns. The architecture is Clean Architecture / Hexagonal (ports & adapters).

---

## Dependency Injection: String Tokens

All cross-layer dependencies use STRING injection tokens. Never use class-based injection for domain interfaces.

```ts
// Domain defines the interface
export interface IAuthRepository {
  assignRole(userId: string, roleName: string): Promise<Role>;
}

// Infrastructure implements it
@Injectable()
export class AuthRepository implements IAuthRepository { ... }

// Module binds token → class
{
  provide: 'IAuthRepository',
  useClass: AuthRepository,
}

// Application consumes via @Inject token
constructor(
  @Inject('IAuthRepository') private readonly authRepository: IAuthRepository,
) {}
```

Token naming convention: `I<InterfaceName>` (e.g., `IAuthRepository`, `IUserService`, `IMailService`).

---

## Inter-Service Communication: RabbitMQ Only

### Two patterns only:

**Request/Response** (`send()` → `@MessagePattern`):
```ts
// Caller
const result = await lastValueFrom(
  this.rmqClient.send<ResponseType>('pattern_name', payload)
);

// Handler
@MessagePattern('pattern_name')
async handle(@Payload() payload: PayloadType): Promise<ResponseType> { ... }
```

**Fire-and-Forget** (`emit()` → `@EventPattern`):
```ts
// Caller
this.rmqClient.emit('event_name', payload);

// Handler
@EventPattern('event_name')
async handle(@Payload() payload: PayloadType): Promise<void> { ... }
```

### Error propagation:
```ts
throw new RpcException({
  statusCode: 409,
  message: 'User already exists',
});
```

Always use `isRpcError()` from `@common/constants/rpc-error.types` to check errors on the caller side.

### Queue naming:
- Each service has its own queue (e.g., `auth_queue`, `user_queue`, `mail_queue`)
- Queues are durable

### Pattern naming conventions:
- auth-service: `auth.<action>` (e.g., `auth.register`, `auth.login`)
- user-service: `create_user`, `update_user`, `delete_user` (snake_case, no prefix) OR `user.<action>` (e.g., `user.find_by_email`, `user.rollback`)
- mail-service: `mail.send`

---

## API Gateway: Thin Routing Layer

The `api-gateway` has NO business logic. Each controller method:
1. Receives HTTP request
2. Forwards via `ClientProxy.send()` to the appropriate microservice
3. Translates `RpcException` → `HttpException`

```ts
private handleMicroserviceError(error: unknown): never {
  if (isRpcError(error)) {
    throw new HttpException(error.message, error.statusCode);
  }
  throw new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
}
```

### Auth guards (in priority order):
- `JwtAuthGuard` — extracts token from cookie or `Authorization` header, verifies via `auth.verify_token`
- `RolesGuard` — checks `@Roles(...)` decorator metadata against `request.user.roles`
- `OwnershipGuard` — allows ADMIN or resource owner (`request.user.id === request.params.id`)

---

## DTOs & Validation: Zod via nestjs-zod

All DTOs use `createZodDto()` from `nestjs-zod`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export class LoginDto extends createZodDto(LoginSchema) {}
```

- DTOs live in `libs/common/src/<domain>/dtos/`
- Response type interfaces live in `libs/common/src/<domain>/interfaces/`
- The gateway uses `ZodValidationPipe` globally

---

## Database: Prisma (Database per Service)

- Each service owns its own PostgreSQL database and Prisma schema
- No foreign keys between services — use logical IDs (strings)
- `PrismaService` extends `PrismaClient` with `OnModuleInit`/`OnModuleDestroy`
- Prisma clients generate to `node_modules/@prisma/<service>-client`
- Migrations managed per-service: `pnpm migrate:<service>`

### Entity mapping pattern:
```ts
// Repository maps Prisma → Domain entity
private toDomain(prismaUser: PrismaUser): User {
  return new User(
    prismaUser.id,
    prismaUser.email,
    // ...
  );
}
```

---

## Saga Pattern (Distributed Transactions)

For operations spanning multiple services, use the saga pattern with compensation:

```ts
async execute(dto: RegisterDto) {
  let result: CreateUserResponse | null = null;
  try {
    result = await this.userService.createUser(dto);       // Step 1
    await this.authRepository.assignRole(result.id, 'USER'); // Step 2
    this.mailService.sendConfirmationEmail(result.email);   // Step 3
    return result;
  } catch (error) {
    if (result?.id) {
      this.userService.rollbackUser(result.id);              // Compensate 1
      await this.authRepository.rollbackRoles(result.id);    // Compensate 2
    }
    throw new SagaCompensationError('Operation failed');
  }
}
```

- Use `SagaCompensationError` from `@common/domain/errors/saga.error`
- Compensations are best-effort (log failures, don't throw)
- Fire-and-forget compensations use `emit()`, critical ones use `send()`

---

## Redis (auth-service)

Used for transient data with TTL:
- Verification codes: `verify:{code}` → userId (900s TTL)
- Role cache: `roles:{userId}` → JSON string[] (900s TTL)
- Password reset: `reset_password:{token}` → userId (900s TTL)

Always check Redis cache before querying the database for roles.

---

## File Naming

- Use cases: `kebab-case.use-case.ts`
- Entities: `kebab-case.entity.ts`
- Errors: `kebab-case.error.ts`
- Interfaces: `kebab-case.interface.ts`
- Controllers: `kebab-case.controller.ts`
- Adapters: `kebab-case.adapter.ts`
- Repositories: `kebab-case.repository.ts`
- DTOs: `kebab-case.dto.ts`

---

## Imports: Path Aliases

Always use `@` aliases, never relative paths for cross-directory imports:

```ts
// ✅ Correct
import { User } from '@user/domain/entities/user.entity';
import { LoginDto } from '@common/auth/dtos/login.dto';

// ❌ Wrong
import { User } from '../../domain/entities/user.entity';
```

---

## No Barrel Files

There are no `index.ts` barrel files in `libs/common`. Import each file directly by its full path. Do not create barrel files.