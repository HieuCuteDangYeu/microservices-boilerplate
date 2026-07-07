
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model PushToken
 * 
 */
export type PushToken = $Result.DefaultSelection<Prisma.$PushTokenPayload>
/**
 * Model NotificationJob
 * 
 */
export type NotificationJob = $Result.DefaultSelection<Prisma.$NotificationJobPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more PushTokens
 * const pushTokens = await prisma.pushToken.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more PushTokens
   * const pushTokens = await prisma.pushToken.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.pushToken`: Exposes CRUD operations for the **PushToken** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PushTokens
    * const pushTokens = await prisma.pushToken.findMany()
    * ```
    */
  get pushToken(): Prisma.PushTokenDelegate<ExtArgs>;

  /**
   * `prisma.notificationJob`: Exposes CRUD operations for the **NotificationJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more NotificationJobs
    * const notificationJobs = await prisma.notificationJob.findMany()
    * ```
    */
  get notificationJob(): Prisma.NotificationJobDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    PushToken: 'PushToken',
    NotificationJob: 'NotificationJob'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "pushToken" | "notificationJob"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      PushToken: {
        payload: Prisma.$PushTokenPayload<ExtArgs>
        fields: Prisma.PushTokenFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PushTokenFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PushTokenFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          findFirst: {
            args: Prisma.PushTokenFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PushTokenFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          findMany: {
            args: Prisma.PushTokenFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>[]
          }
          create: {
            args: Prisma.PushTokenCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          createMany: {
            args: Prisma.PushTokenCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PushTokenCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>[]
          }
          delete: {
            args: Prisma.PushTokenDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          update: {
            args: Prisma.PushTokenUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          deleteMany: {
            args: Prisma.PushTokenDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PushTokenUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PushTokenUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PushTokenPayload>
          }
          aggregate: {
            args: Prisma.PushTokenAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePushToken>
          }
          groupBy: {
            args: Prisma.PushTokenGroupByArgs<ExtArgs>
            result: $Utils.Optional<PushTokenGroupByOutputType>[]
          }
          count: {
            args: Prisma.PushTokenCountArgs<ExtArgs>
            result: $Utils.Optional<PushTokenCountAggregateOutputType> | number
          }
        }
      }
      NotificationJob: {
        payload: Prisma.$NotificationJobPayload<ExtArgs>
        fields: Prisma.NotificationJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.NotificationJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.NotificationJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          findFirst: {
            args: Prisma.NotificationJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.NotificationJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          findMany: {
            args: Prisma.NotificationJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>[]
          }
          create: {
            args: Prisma.NotificationJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          createMany: {
            args: Prisma.NotificationJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.NotificationJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>[]
          }
          delete: {
            args: Prisma.NotificationJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          update: {
            args: Prisma.NotificationJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          deleteMany: {
            args: Prisma.NotificationJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.NotificationJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.NotificationJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$NotificationJobPayload>
          }
          aggregate: {
            args: Prisma.NotificationJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateNotificationJob>
          }
          groupBy: {
            args: Prisma.NotificationJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<NotificationJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.NotificationJobCountArgs<ExtArgs>
            result: $Utils.Optional<NotificationJobCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model PushToken
   */

  export type AggregatePushToken = {
    _count: PushTokenCountAggregateOutputType | null
    _min: PushTokenMinAggregateOutputType | null
    _max: PushTokenMaxAggregateOutputType | null
  }

  export type PushTokenMinAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: string | null
    platform: string | null
    token: string | null
    deviceId: string | null
    appVersion: string | null
    isActive: boolean | null
    lastSeenAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PushTokenMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    provider: string | null
    platform: string | null
    token: string | null
    deviceId: string | null
    appVersion: string | null
    isActive: boolean | null
    lastSeenAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PushTokenCountAggregateOutputType = {
    id: number
    userId: number
    provider: number
    platform: number
    token: number
    deviceId: number
    appVersion: number
    isActive: number
    lastSeenAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PushTokenMinAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    platform?: true
    token?: true
    deviceId?: true
    appVersion?: true
    isActive?: true
    lastSeenAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PushTokenMaxAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    platform?: true
    token?: true
    deviceId?: true
    appVersion?: true
    isActive?: true
    lastSeenAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PushTokenCountAggregateInputType = {
    id?: true
    userId?: true
    provider?: true
    platform?: true
    token?: true
    deviceId?: true
    appVersion?: true
    isActive?: true
    lastSeenAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PushTokenAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PushToken to aggregate.
     */
    where?: PushTokenWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PushTokens to fetch.
     */
    orderBy?: PushTokenOrderByWithRelationInput | PushTokenOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PushTokenWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PushTokens from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PushTokens.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PushTokens
    **/
    _count?: true | PushTokenCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PushTokenMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PushTokenMaxAggregateInputType
  }

  export type GetPushTokenAggregateType<T extends PushTokenAggregateArgs> = {
        [P in keyof T & keyof AggregatePushToken]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePushToken[P]>
      : GetScalarType<T[P], AggregatePushToken[P]>
  }




  export type PushTokenGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PushTokenWhereInput
    orderBy?: PushTokenOrderByWithAggregationInput | PushTokenOrderByWithAggregationInput[]
    by: PushTokenScalarFieldEnum[] | PushTokenScalarFieldEnum
    having?: PushTokenScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PushTokenCountAggregateInputType | true
    _min?: PushTokenMinAggregateInputType
    _max?: PushTokenMaxAggregateInputType
  }

  export type PushTokenGroupByOutputType = {
    id: string
    userId: string
    provider: string
    platform: string
    token: string
    deviceId: string | null
    appVersion: string | null
    isActive: boolean
    lastSeenAt: Date
    createdAt: Date
    updatedAt: Date
    _count: PushTokenCountAggregateOutputType | null
    _min: PushTokenMinAggregateOutputType | null
    _max: PushTokenMaxAggregateOutputType | null
  }

  type GetPushTokenGroupByPayload<T extends PushTokenGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PushTokenGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PushTokenGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PushTokenGroupByOutputType[P]>
            : GetScalarType<T[P], PushTokenGroupByOutputType[P]>
        }
      >
    >


  export type PushTokenSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    platform?: boolean
    token?: boolean
    deviceId?: boolean
    appVersion?: boolean
    isActive?: boolean
    lastSeenAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["pushToken"]>

  export type PushTokenSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    provider?: boolean
    platform?: boolean
    token?: boolean
    deviceId?: boolean
    appVersion?: boolean
    isActive?: boolean
    lastSeenAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["pushToken"]>

  export type PushTokenSelectScalar = {
    id?: boolean
    userId?: boolean
    provider?: boolean
    platform?: boolean
    token?: boolean
    deviceId?: boolean
    appVersion?: boolean
    isActive?: boolean
    lastSeenAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $PushTokenPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PushToken"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      provider: string
      platform: string
      token: string
      deviceId: string | null
      appVersion: string | null
      isActive: boolean
      lastSeenAt: Date
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["pushToken"]>
    composites: {}
  }

  type PushTokenGetPayload<S extends boolean | null | undefined | PushTokenDefaultArgs> = $Result.GetResult<Prisma.$PushTokenPayload, S>

  type PushTokenCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<PushTokenFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: PushTokenCountAggregateInputType | true
    }

  export interface PushTokenDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PushToken'], meta: { name: 'PushToken' } }
    /**
     * Find zero or one PushToken that matches the filter.
     * @param {PushTokenFindUniqueArgs} args - Arguments to find a PushToken
     * @example
     * // Get one PushToken
     * const pushToken = await prisma.pushToken.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PushTokenFindUniqueArgs>(args: SelectSubset<T, PushTokenFindUniqueArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one PushToken that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {PushTokenFindUniqueOrThrowArgs} args - Arguments to find a PushToken
     * @example
     * // Get one PushToken
     * const pushToken = await prisma.pushToken.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PushTokenFindUniqueOrThrowArgs>(args: SelectSubset<T, PushTokenFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first PushToken that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenFindFirstArgs} args - Arguments to find a PushToken
     * @example
     * // Get one PushToken
     * const pushToken = await prisma.pushToken.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PushTokenFindFirstArgs>(args?: SelectSubset<T, PushTokenFindFirstArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first PushToken that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenFindFirstOrThrowArgs} args - Arguments to find a PushToken
     * @example
     * // Get one PushToken
     * const pushToken = await prisma.pushToken.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PushTokenFindFirstOrThrowArgs>(args?: SelectSubset<T, PushTokenFindFirstOrThrowArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more PushTokens that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PushTokens
     * const pushTokens = await prisma.pushToken.findMany()
     * 
     * // Get first 10 PushTokens
     * const pushTokens = await prisma.pushToken.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const pushTokenWithIdOnly = await prisma.pushToken.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PushTokenFindManyArgs>(args?: SelectSubset<T, PushTokenFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a PushToken.
     * @param {PushTokenCreateArgs} args - Arguments to create a PushToken.
     * @example
     * // Create one PushToken
     * const PushToken = await prisma.pushToken.create({
     *   data: {
     *     // ... data to create a PushToken
     *   }
     * })
     * 
     */
    create<T extends PushTokenCreateArgs>(args: SelectSubset<T, PushTokenCreateArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many PushTokens.
     * @param {PushTokenCreateManyArgs} args - Arguments to create many PushTokens.
     * @example
     * // Create many PushTokens
     * const pushToken = await prisma.pushToken.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PushTokenCreateManyArgs>(args?: SelectSubset<T, PushTokenCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many PushTokens and returns the data saved in the database.
     * @param {PushTokenCreateManyAndReturnArgs} args - Arguments to create many PushTokens.
     * @example
     * // Create many PushTokens
     * const pushToken = await prisma.pushToken.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many PushTokens and only return the `id`
     * const pushTokenWithIdOnly = await prisma.pushToken.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PushTokenCreateManyAndReturnArgs>(args?: SelectSubset<T, PushTokenCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a PushToken.
     * @param {PushTokenDeleteArgs} args - Arguments to delete one PushToken.
     * @example
     * // Delete one PushToken
     * const PushToken = await prisma.pushToken.delete({
     *   where: {
     *     // ... filter to delete one PushToken
     *   }
     * })
     * 
     */
    delete<T extends PushTokenDeleteArgs>(args: SelectSubset<T, PushTokenDeleteArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one PushToken.
     * @param {PushTokenUpdateArgs} args - Arguments to update one PushToken.
     * @example
     * // Update one PushToken
     * const pushToken = await prisma.pushToken.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PushTokenUpdateArgs>(args: SelectSubset<T, PushTokenUpdateArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more PushTokens.
     * @param {PushTokenDeleteManyArgs} args - Arguments to filter PushTokens to delete.
     * @example
     * // Delete a few PushTokens
     * const { count } = await prisma.pushToken.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PushTokenDeleteManyArgs>(args?: SelectSubset<T, PushTokenDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PushTokens.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PushTokens
     * const pushToken = await prisma.pushToken.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PushTokenUpdateManyArgs>(args: SelectSubset<T, PushTokenUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one PushToken.
     * @param {PushTokenUpsertArgs} args - Arguments to update or create a PushToken.
     * @example
     * // Update or create a PushToken
     * const pushToken = await prisma.pushToken.upsert({
     *   create: {
     *     // ... data to create a PushToken
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PushToken we want to update
     *   }
     * })
     */
    upsert<T extends PushTokenUpsertArgs>(args: SelectSubset<T, PushTokenUpsertArgs<ExtArgs>>): Prisma__PushTokenClient<$Result.GetResult<Prisma.$PushTokenPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of PushTokens.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenCountArgs} args - Arguments to filter PushTokens to count.
     * @example
     * // Count the number of PushTokens
     * const count = await prisma.pushToken.count({
     *   where: {
     *     // ... the filter for the PushTokens we want to count
     *   }
     * })
    **/
    count<T extends PushTokenCountArgs>(
      args?: Subset<T, PushTokenCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PushTokenCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PushToken.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PushTokenAggregateArgs>(args: Subset<T, PushTokenAggregateArgs>): Prisma.PrismaPromise<GetPushTokenAggregateType<T>>

    /**
     * Group by PushToken.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PushTokenGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PushTokenGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PushTokenGroupByArgs['orderBy'] }
        : { orderBy?: PushTokenGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PushTokenGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPushTokenGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PushToken model
   */
  readonly fields: PushTokenFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PushToken.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PushTokenClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PushToken model
   */ 
  interface PushTokenFieldRefs {
    readonly id: FieldRef<"PushToken", 'String'>
    readonly userId: FieldRef<"PushToken", 'String'>
    readonly provider: FieldRef<"PushToken", 'String'>
    readonly platform: FieldRef<"PushToken", 'String'>
    readonly token: FieldRef<"PushToken", 'String'>
    readonly deviceId: FieldRef<"PushToken", 'String'>
    readonly appVersion: FieldRef<"PushToken", 'String'>
    readonly isActive: FieldRef<"PushToken", 'Boolean'>
    readonly lastSeenAt: FieldRef<"PushToken", 'DateTime'>
    readonly createdAt: FieldRef<"PushToken", 'DateTime'>
    readonly updatedAt: FieldRef<"PushToken", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * PushToken findUnique
   */
  export type PushTokenFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter, which PushToken to fetch.
     */
    where: PushTokenWhereUniqueInput
  }

  /**
   * PushToken findUniqueOrThrow
   */
  export type PushTokenFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter, which PushToken to fetch.
     */
    where: PushTokenWhereUniqueInput
  }

  /**
   * PushToken findFirst
   */
  export type PushTokenFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter, which PushToken to fetch.
     */
    where?: PushTokenWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PushTokens to fetch.
     */
    orderBy?: PushTokenOrderByWithRelationInput | PushTokenOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PushTokens.
     */
    cursor?: PushTokenWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PushTokens from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PushTokens.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PushTokens.
     */
    distinct?: PushTokenScalarFieldEnum | PushTokenScalarFieldEnum[]
  }

  /**
   * PushToken findFirstOrThrow
   */
  export type PushTokenFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter, which PushToken to fetch.
     */
    where?: PushTokenWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PushTokens to fetch.
     */
    orderBy?: PushTokenOrderByWithRelationInput | PushTokenOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PushTokens.
     */
    cursor?: PushTokenWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PushTokens from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PushTokens.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PushTokens.
     */
    distinct?: PushTokenScalarFieldEnum | PushTokenScalarFieldEnum[]
  }

  /**
   * PushToken findMany
   */
  export type PushTokenFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter, which PushTokens to fetch.
     */
    where?: PushTokenWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PushTokens to fetch.
     */
    orderBy?: PushTokenOrderByWithRelationInput | PushTokenOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PushTokens.
     */
    cursor?: PushTokenWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PushTokens from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PushTokens.
     */
    skip?: number
    distinct?: PushTokenScalarFieldEnum | PushTokenScalarFieldEnum[]
  }

  /**
   * PushToken create
   */
  export type PushTokenCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * The data needed to create a PushToken.
     */
    data: XOR<PushTokenCreateInput, PushTokenUncheckedCreateInput>
  }

  /**
   * PushToken createMany
   */
  export type PushTokenCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PushTokens.
     */
    data: PushTokenCreateManyInput | PushTokenCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PushToken createManyAndReturn
   */
  export type PushTokenCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many PushTokens.
     */
    data: PushTokenCreateManyInput | PushTokenCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PushToken update
   */
  export type PushTokenUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * The data needed to update a PushToken.
     */
    data: XOR<PushTokenUpdateInput, PushTokenUncheckedUpdateInput>
    /**
     * Choose, which PushToken to update.
     */
    where: PushTokenWhereUniqueInput
  }

  /**
   * PushToken updateMany
   */
  export type PushTokenUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PushTokens.
     */
    data: XOR<PushTokenUpdateManyMutationInput, PushTokenUncheckedUpdateManyInput>
    /**
     * Filter which PushTokens to update
     */
    where?: PushTokenWhereInput
  }

  /**
   * PushToken upsert
   */
  export type PushTokenUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * The filter to search for the PushToken to update in case it exists.
     */
    where: PushTokenWhereUniqueInput
    /**
     * In case the PushToken found by the `where` argument doesn't exist, create a new PushToken with this data.
     */
    create: XOR<PushTokenCreateInput, PushTokenUncheckedCreateInput>
    /**
     * In case the PushToken was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PushTokenUpdateInput, PushTokenUncheckedUpdateInput>
  }

  /**
   * PushToken delete
   */
  export type PushTokenDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
    /**
     * Filter which PushToken to delete.
     */
    where: PushTokenWhereUniqueInput
  }

  /**
   * PushToken deleteMany
   */
  export type PushTokenDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PushTokens to delete
     */
    where?: PushTokenWhereInput
  }

  /**
   * PushToken without action
   */
  export type PushTokenDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PushToken
     */
    select?: PushTokenSelect<ExtArgs> | null
  }


  /**
   * Model NotificationJob
   */

  export type AggregateNotificationJob = {
    _count: NotificationJobCountAggregateOutputType | null
    _avg: NotificationJobAvgAggregateOutputType | null
    _sum: NotificationJobSumAggregateOutputType | null
    _min: NotificationJobMinAggregateOutputType | null
    _max: NotificationJobMaxAggregateOutputType | null
  }

  export type NotificationJobAvgAggregateOutputType = {
    attemptCount: number | null
  }

  export type NotificationJobSumAggregateOutputType = {
    attemptCount: number | null
  }

  export type NotificationJobMinAggregateOutputType = {
    id: string | null
    type: string | null
    recipientUserId: string | null
    actorUserId: string | null
    conversationId: string | null
    messageId: string | null
    title: string | null
    body: string | null
    status: string | null
    attemptCount: number | null
    nextAttemptAt: Date | null
    lastError: string | null
    createdAt: Date | null
    updatedAt: Date | null
    sentAt: Date | null
  }

  export type NotificationJobMaxAggregateOutputType = {
    id: string | null
    type: string | null
    recipientUserId: string | null
    actorUserId: string | null
    conversationId: string | null
    messageId: string | null
    title: string | null
    body: string | null
    status: string | null
    attemptCount: number | null
    nextAttemptAt: Date | null
    lastError: string | null
    createdAt: Date | null
    updatedAt: Date | null
    sentAt: Date | null
  }

  export type NotificationJobCountAggregateOutputType = {
    id: number
    type: number
    recipientUserId: number
    actorUserId: number
    conversationId: number
    messageId: number
    title: number
    body: number
    dataJson: number
    status: number
    attemptCount: number
    nextAttemptAt: number
    lastError: number
    createdAt: number
    updatedAt: number
    sentAt: number
    _all: number
  }


  export type NotificationJobAvgAggregateInputType = {
    attemptCount?: true
  }

  export type NotificationJobSumAggregateInputType = {
    attemptCount?: true
  }

  export type NotificationJobMinAggregateInputType = {
    id?: true
    type?: true
    recipientUserId?: true
    actorUserId?: true
    conversationId?: true
    messageId?: true
    title?: true
    body?: true
    status?: true
    attemptCount?: true
    nextAttemptAt?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
    sentAt?: true
  }

  export type NotificationJobMaxAggregateInputType = {
    id?: true
    type?: true
    recipientUserId?: true
    actorUserId?: true
    conversationId?: true
    messageId?: true
    title?: true
    body?: true
    status?: true
    attemptCount?: true
    nextAttemptAt?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
    sentAt?: true
  }

  export type NotificationJobCountAggregateInputType = {
    id?: true
    type?: true
    recipientUserId?: true
    actorUserId?: true
    conversationId?: true
    messageId?: true
    title?: true
    body?: true
    dataJson?: true
    status?: true
    attemptCount?: true
    nextAttemptAt?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
    sentAt?: true
    _all?: true
  }

  export type NotificationJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which NotificationJob to aggregate.
     */
    where?: NotificationJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of NotificationJobs to fetch.
     */
    orderBy?: NotificationJobOrderByWithRelationInput | NotificationJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: NotificationJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` NotificationJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` NotificationJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned NotificationJobs
    **/
    _count?: true | NotificationJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: NotificationJobAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: NotificationJobSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: NotificationJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: NotificationJobMaxAggregateInputType
  }

  export type GetNotificationJobAggregateType<T extends NotificationJobAggregateArgs> = {
        [P in keyof T & keyof AggregateNotificationJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateNotificationJob[P]>
      : GetScalarType<T[P], AggregateNotificationJob[P]>
  }




  export type NotificationJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: NotificationJobWhereInput
    orderBy?: NotificationJobOrderByWithAggregationInput | NotificationJobOrderByWithAggregationInput[]
    by: NotificationJobScalarFieldEnum[] | NotificationJobScalarFieldEnum
    having?: NotificationJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: NotificationJobCountAggregateInputType | true
    _avg?: NotificationJobAvgAggregateInputType
    _sum?: NotificationJobSumAggregateInputType
    _min?: NotificationJobMinAggregateInputType
    _max?: NotificationJobMaxAggregateInputType
  }

  export type NotificationJobGroupByOutputType = {
    id: string
    type: string
    recipientUserId: string
    actorUserId: string | null
    conversationId: string | null
    messageId: string | null
    title: string
    body: string
    dataJson: JsonValue | null
    status: string
    attemptCount: number
    nextAttemptAt: Date | null
    lastError: string | null
    createdAt: Date
    updatedAt: Date
    sentAt: Date | null
    _count: NotificationJobCountAggregateOutputType | null
    _avg: NotificationJobAvgAggregateOutputType | null
    _sum: NotificationJobSumAggregateOutputType | null
    _min: NotificationJobMinAggregateOutputType | null
    _max: NotificationJobMaxAggregateOutputType | null
  }

  type GetNotificationJobGroupByPayload<T extends NotificationJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<NotificationJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof NotificationJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], NotificationJobGroupByOutputType[P]>
            : GetScalarType<T[P], NotificationJobGroupByOutputType[P]>
        }
      >
    >


  export type NotificationJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    recipientUserId?: boolean
    actorUserId?: boolean
    conversationId?: boolean
    messageId?: boolean
    title?: boolean
    body?: boolean
    dataJson?: boolean
    status?: boolean
    attemptCount?: boolean
    nextAttemptAt?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    sentAt?: boolean
  }, ExtArgs["result"]["notificationJob"]>

  export type NotificationJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    recipientUserId?: boolean
    actorUserId?: boolean
    conversationId?: boolean
    messageId?: boolean
    title?: boolean
    body?: boolean
    dataJson?: boolean
    status?: boolean
    attemptCount?: boolean
    nextAttemptAt?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    sentAt?: boolean
  }, ExtArgs["result"]["notificationJob"]>

  export type NotificationJobSelectScalar = {
    id?: boolean
    type?: boolean
    recipientUserId?: boolean
    actorUserId?: boolean
    conversationId?: boolean
    messageId?: boolean
    title?: boolean
    body?: boolean
    dataJson?: boolean
    status?: boolean
    attemptCount?: boolean
    nextAttemptAt?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    sentAt?: boolean
  }


  export type $NotificationJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "NotificationJob"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      type: string
      recipientUserId: string
      actorUserId: string | null
      conversationId: string | null
      messageId: string | null
      title: string
      body: string
      dataJson: Prisma.JsonValue | null
      status: string
      attemptCount: number
      nextAttemptAt: Date | null
      lastError: string | null
      createdAt: Date
      updatedAt: Date
      sentAt: Date | null
    }, ExtArgs["result"]["notificationJob"]>
    composites: {}
  }

  type NotificationJobGetPayload<S extends boolean | null | undefined | NotificationJobDefaultArgs> = $Result.GetResult<Prisma.$NotificationJobPayload, S>

  type NotificationJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<NotificationJobFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: NotificationJobCountAggregateInputType | true
    }

  export interface NotificationJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['NotificationJob'], meta: { name: 'NotificationJob' } }
    /**
     * Find zero or one NotificationJob that matches the filter.
     * @param {NotificationJobFindUniqueArgs} args - Arguments to find a NotificationJob
     * @example
     * // Get one NotificationJob
     * const notificationJob = await prisma.notificationJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends NotificationJobFindUniqueArgs>(args: SelectSubset<T, NotificationJobFindUniqueArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one NotificationJob that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {NotificationJobFindUniqueOrThrowArgs} args - Arguments to find a NotificationJob
     * @example
     * // Get one NotificationJob
     * const notificationJob = await prisma.notificationJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends NotificationJobFindUniqueOrThrowArgs>(args: SelectSubset<T, NotificationJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first NotificationJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobFindFirstArgs} args - Arguments to find a NotificationJob
     * @example
     * // Get one NotificationJob
     * const notificationJob = await prisma.notificationJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends NotificationJobFindFirstArgs>(args?: SelectSubset<T, NotificationJobFindFirstArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first NotificationJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobFindFirstOrThrowArgs} args - Arguments to find a NotificationJob
     * @example
     * // Get one NotificationJob
     * const notificationJob = await prisma.notificationJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends NotificationJobFindFirstOrThrowArgs>(args?: SelectSubset<T, NotificationJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more NotificationJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all NotificationJobs
     * const notificationJobs = await prisma.notificationJob.findMany()
     * 
     * // Get first 10 NotificationJobs
     * const notificationJobs = await prisma.notificationJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const notificationJobWithIdOnly = await prisma.notificationJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends NotificationJobFindManyArgs>(args?: SelectSubset<T, NotificationJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a NotificationJob.
     * @param {NotificationJobCreateArgs} args - Arguments to create a NotificationJob.
     * @example
     * // Create one NotificationJob
     * const NotificationJob = await prisma.notificationJob.create({
     *   data: {
     *     // ... data to create a NotificationJob
     *   }
     * })
     * 
     */
    create<T extends NotificationJobCreateArgs>(args: SelectSubset<T, NotificationJobCreateArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many NotificationJobs.
     * @param {NotificationJobCreateManyArgs} args - Arguments to create many NotificationJobs.
     * @example
     * // Create many NotificationJobs
     * const notificationJob = await prisma.notificationJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends NotificationJobCreateManyArgs>(args?: SelectSubset<T, NotificationJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many NotificationJobs and returns the data saved in the database.
     * @param {NotificationJobCreateManyAndReturnArgs} args - Arguments to create many NotificationJobs.
     * @example
     * // Create many NotificationJobs
     * const notificationJob = await prisma.notificationJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many NotificationJobs and only return the `id`
     * const notificationJobWithIdOnly = await prisma.notificationJob.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends NotificationJobCreateManyAndReturnArgs>(args?: SelectSubset<T, NotificationJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a NotificationJob.
     * @param {NotificationJobDeleteArgs} args - Arguments to delete one NotificationJob.
     * @example
     * // Delete one NotificationJob
     * const NotificationJob = await prisma.notificationJob.delete({
     *   where: {
     *     // ... filter to delete one NotificationJob
     *   }
     * })
     * 
     */
    delete<T extends NotificationJobDeleteArgs>(args: SelectSubset<T, NotificationJobDeleteArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one NotificationJob.
     * @param {NotificationJobUpdateArgs} args - Arguments to update one NotificationJob.
     * @example
     * // Update one NotificationJob
     * const notificationJob = await prisma.notificationJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends NotificationJobUpdateArgs>(args: SelectSubset<T, NotificationJobUpdateArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more NotificationJobs.
     * @param {NotificationJobDeleteManyArgs} args - Arguments to filter NotificationJobs to delete.
     * @example
     * // Delete a few NotificationJobs
     * const { count } = await prisma.notificationJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends NotificationJobDeleteManyArgs>(args?: SelectSubset<T, NotificationJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more NotificationJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many NotificationJobs
     * const notificationJob = await prisma.notificationJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends NotificationJobUpdateManyArgs>(args: SelectSubset<T, NotificationJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one NotificationJob.
     * @param {NotificationJobUpsertArgs} args - Arguments to update or create a NotificationJob.
     * @example
     * // Update or create a NotificationJob
     * const notificationJob = await prisma.notificationJob.upsert({
     *   create: {
     *     // ... data to create a NotificationJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the NotificationJob we want to update
     *   }
     * })
     */
    upsert<T extends NotificationJobUpsertArgs>(args: SelectSubset<T, NotificationJobUpsertArgs<ExtArgs>>): Prisma__NotificationJobClient<$Result.GetResult<Prisma.$NotificationJobPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of NotificationJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobCountArgs} args - Arguments to filter NotificationJobs to count.
     * @example
     * // Count the number of NotificationJobs
     * const count = await prisma.notificationJob.count({
     *   where: {
     *     // ... the filter for the NotificationJobs we want to count
     *   }
     * })
    **/
    count<T extends NotificationJobCountArgs>(
      args?: Subset<T, NotificationJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], NotificationJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a NotificationJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends NotificationJobAggregateArgs>(args: Subset<T, NotificationJobAggregateArgs>): Prisma.PrismaPromise<GetNotificationJobAggregateType<T>>

    /**
     * Group by NotificationJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {NotificationJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends NotificationJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: NotificationJobGroupByArgs['orderBy'] }
        : { orderBy?: NotificationJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, NotificationJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetNotificationJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the NotificationJob model
   */
  readonly fields: NotificationJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for NotificationJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__NotificationJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the NotificationJob model
   */ 
  interface NotificationJobFieldRefs {
    readonly id: FieldRef<"NotificationJob", 'String'>
    readonly type: FieldRef<"NotificationJob", 'String'>
    readonly recipientUserId: FieldRef<"NotificationJob", 'String'>
    readonly actorUserId: FieldRef<"NotificationJob", 'String'>
    readonly conversationId: FieldRef<"NotificationJob", 'String'>
    readonly messageId: FieldRef<"NotificationJob", 'String'>
    readonly title: FieldRef<"NotificationJob", 'String'>
    readonly body: FieldRef<"NotificationJob", 'String'>
    readonly dataJson: FieldRef<"NotificationJob", 'Json'>
    readonly status: FieldRef<"NotificationJob", 'String'>
    readonly attemptCount: FieldRef<"NotificationJob", 'Int'>
    readonly nextAttemptAt: FieldRef<"NotificationJob", 'DateTime'>
    readonly lastError: FieldRef<"NotificationJob", 'String'>
    readonly createdAt: FieldRef<"NotificationJob", 'DateTime'>
    readonly updatedAt: FieldRef<"NotificationJob", 'DateTime'>
    readonly sentAt: FieldRef<"NotificationJob", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * NotificationJob findUnique
   */
  export type NotificationJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter, which NotificationJob to fetch.
     */
    where: NotificationJobWhereUniqueInput
  }

  /**
   * NotificationJob findUniqueOrThrow
   */
  export type NotificationJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter, which NotificationJob to fetch.
     */
    where: NotificationJobWhereUniqueInput
  }

  /**
   * NotificationJob findFirst
   */
  export type NotificationJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter, which NotificationJob to fetch.
     */
    where?: NotificationJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of NotificationJobs to fetch.
     */
    orderBy?: NotificationJobOrderByWithRelationInput | NotificationJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for NotificationJobs.
     */
    cursor?: NotificationJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` NotificationJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` NotificationJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of NotificationJobs.
     */
    distinct?: NotificationJobScalarFieldEnum | NotificationJobScalarFieldEnum[]
  }

  /**
   * NotificationJob findFirstOrThrow
   */
  export type NotificationJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter, which NotificationJob to fetch.
     */
    where?: NotificationJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of NotificationJobs to fetch.
     */
    orderBy?: NotificationJobOrderByWithRelationInput | NotificationJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for NotificationJobs.
     */
    cursor?: NotificationJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` NotificationJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` NotificationJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of NotificationJobs.
     */
    distinct?: NotificationJobScalarFieldEnum | NotificationJobScalarFieldEnum[]
  }

  /**
   * NotificationJob findMany
   */
  export type NotificationJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter, which NotificationJobs to fetch.
     */
    where?: NotificationJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of NotificationJobs to fetch.
     */
    orderBy?: NotificationJobOrderByWithRelationInput | NotificationJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing NotificationJobs.
     */
    cursor?: NotificationJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` NotificationJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` NotificationJobs.
     */
    skip?: number
    distinct?: NotificationJobScalarFieldEnum | NotificationJobScalarFieldEnum[]
  }

  /**
   * NotificationJob create
   */
  export type NotificationJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * The data needed to create a NotificationJob.
     */
    data: XOR<NotificationJobCreateInput, NotificationJobUncheckedCreateInput>
  }

  /**
   * NotificationJob createMany
   */
  export type NotificationJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many NotificationJobs.
     */
    data: NotificationJobCreateManyInput | NotificationJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * NotificationJob createManyAndReturn
   */
  export type NotificationJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many NotificationJobs.
     */
    data: NotificationJobCreateManyInput | NotificationJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * NotificationJob update
   */
  export type NotificationJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * The data needed to update a NotificationJob.
     */
    data: XOR<NotificationJobUpdateInput, NotificationJobUncheckedUpdateInput>
    /**
     * Choose, which NotificationJob to update.
     */
    where: NotificationJobWhereUniqueInput
  }

  /**
   * NotificationJob updateMany
   */
  export type NotificationJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update NotificationJobs.
     */
    data: XOR<NotificationJobUpdateManyMutationInput, NotificationJobUncheckedUpdateManyInput>
    /**
     * Filter which NotificationJobs to update
     */
    where?: NotificationJobWhereInput
  }

  /**
   * NotificationJob upsert
   */
  export type NotificationJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * The filter to search for the NotificationJob to update in case it exists.
     */
    where: NotificationJobWhereUniqueInput
    /**
     * In case the NotificationJob found by the `where` argument doesn't exist, create a new NotificationJob with this data.
     */
    create: XOR<NotificationJobCreateInput, NotificationJobUncheckedCreateInput>
    /**
     * In case the NotificationJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<NotificationJobUpdateInput, NotificationJobUncheckedUpdateInput>
  }

  /**
   * NotificationJob delete
   */
  export type NotificationJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
    /**
     * Filter which NotificationJob to delete.
     */
    where: NotificationJobWhereUniqueInput
  }

  /**
   * NotificationJob deleteMany
   */
  export type NotificationJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which NotificationJobs to delete
     */
    where?: NotificationJobWhereInput
  }

  /**
   * NotificationJob without action
   */
  export type NotificationJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the NotificationJob
     */
    select?: NotificationJobSelect<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const PushTokenScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    provider: 'provider',
    platform: 'platform',
    token: 'token',
    deviceId: 'deviceId',
    appVersion: 'appVersion',
    isActive: 'isActive',
    lastSeenAt: 'lastSeenAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PushTokenScalarFieldEnum = (typeof PushTokenScalarFieldEnum)[keyof typeof PushTokenScalarFieldEnum]


  export const NotificationJobScalarFieldEnum: {
    id: 'id',
    type: 'type',
    recipientUserId: 'recipientUserId',
    actorUserId: 'actorUserId',
    conversationId: 'conversationId',
    messageId: 'messageId',
    title: 'title',
    body: 'body',
    dataJson: 'dataJson',
    status: 'status',
    attemptCount: 'attemptCount',
    nextAttemptAt: 'nextAttemptAt',
    lastError: 'lastError',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    sentAt: 'sentAt'
  };

  export type NotificationJobScalarFieldEnum = (typeof NotificationJobScalarFieldEnum)[keyof typeof NotificationJobScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type PushTokenWhereInput = {
    AND?: PushTokenWhereInput | PushTokenWhereInput[]
    OR?: PushTokenWhereInput[]
    NOT?: PushTokenWhereInput | PushTokenWhereInput[]
    id?: StringFilter<"PushToken"> | string
    userId?: StringFilter<"PushToken"> | string
    provider?: StringFilter<"PushToken"> | string
    platform?: StringFilter<"PushToken"> | string
    token?: StringFilter<"PushToken"> | string
    deviceId?: StringNullableFilter<"PushToken"> | string | null
    appVersion?: StringNullableFilter<"PushToken"> | string | null
    isActive?: BoolFilter<"PushToken"> | boolean
    lastSeenAt?: DateTimeFilter<"PushToken"> | Date | string
    createdAt?: DateTimeFilter<"PushToken"> | Date | string
    updatedAt?: DateTimeFilter<"PushToken"> | Date | string
  }

  export type PushTokenOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    platform?: SortOrder
    token?: SortOrder
    deviceId?: SortOrderInput | SortOrder
    appVersion?: SortOrderInput | SortOrder
    isActive?: SortOrder
    lastSeenAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PushTokenWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    provider_token?: PushTokenProviderTokenCompoundUniqueInput
    AND?: PushTokenWhereInput | PushTokenWhereInput[]
    OR?: PushTokenWhereInput[]
    NOT?: PushTokenWhereInput | PushTokenWhereInput[]
    userId?: StringFilter<"PushToken"> | string
    provider?: StringFilter<"PushToken"> | string
    platform?: StringFilter<"PushToken"> | string
    token?: StringFilter<"PushToken"> | string
    deviceId?: StringNullableFilter<"PushToken"> | string | null
    appVersion?: StringNullableFilter<"PushToken"> | string | null
    isActive?: BoolFilter<"PushToken"> | boolean
    lastSeenAt?: DateTimeFilter<"PushToken"> | Date | string
    createdAt?: DateTimeFilter<"PushToken"> | Date | string
    updatedAt?: DateTimeFilter<"PushToken"> | Date | string
  }, "id" | "provider_token">

  export type PushTokenOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    platform?: SortOrder
    token?: SortOrder
    deviceId?: SortOrderInput | SortOrder
    appVersion?: SortOrderInput | SortOrder
    isActive?: SortOrder
    lastSeenAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PushTokenCountOrderByAggregateInput
    _max?: PushTokenMaxOrderByAggregateInput
    _min?: PushTokenMinOrderByAggregateInput
  }

  export type PushTokenScalarWhereWithAggregatesInput = {
    AND?: PushTokenScalarWhereWithAggregatesInput | PushTokenScalarWhereWithAggregatesInput[]
    OR?: PushTokenScalarWhereWithAggregatesInput[]
    NOT?: PushTokenScalarWhereWithAggregatesInput | PushTokenScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"PushToken"> | string
    userId?: StringWithAggregatesFilter<"PushToken"> | string
    provider?: StringWithAggregatesFilter<"PushToken"> | string
    platform?: StringWithAggregatesFilter<"PushToken"> | string
    token?: StringWithAggregatesFilter<"PushToken"> | string
    deviceId?: StringNullableWithAggregatesFilter<"PushToken"> | string | null
    appVersion?: StringNullableWithAggregatesFilter<"PushToken"> | string | null
    isActive?: BoolWithAggregatesFilter<"PushToken"> | boolean
    lastSeenAt?: DateTimeWithAggregatesFilter<"PushToken"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"PushToken"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"PushToken"> | Date | string
  }

  export type NotificationJobWhereInput = {
    AND?: NotificationJobWhereInput | NotificationJobWhereInput[]
    OR?: NotificationJobWhereInput[]
    NOT?: NotificationJobWhereInput | NotificationJobWhereInput[]
    id?: StringFilter<"NotificationJob"> | string
    type?: StringFilter<"NotificationJob"> | string
    recipientUserId?: StringFilter<"NotificationJob"> | string
    actorUserId?: StringNullableFilter<"NotificationJob"> | string | null
    conversationId?: StringNullableFilter<"NotificationJob"> | string | null
    messageId?: StringNullableFilter<"NotificationJob"> | string | null
    title?: StringFilter<"NotificationJob"> | string
    body?: StringFilter<"NotificationJob"> | string
    dataJson?: JsonNullableFilter<"NotificationJob">
    status?: StringFilter<"NotificationJob"> | string
    attemptCount?: IntFilter<"NotificationJob"> | number
    nextAttemptAt?: DateTimeNullableFilter<"NotificationJob"> | Date | string | null
    lastError?: StringNullableFilter<"NotificationJob"> | string | null
    createdAt?: DateTimeFilter<"NotificationJob"> | Date | string
    updatedAt?: DateTimeFilter<"NotificationJob"> | Date | string
    sentAt?: DateTimeNullableFilter<"NotificationJob"> | Date | string | null
  }

  export type NotificationJobOrderByWithRelationInput = {
    id?: SortOrder
    type?: SortOrder
    recipientUserId?: SortOrder
    actorUserId?: SortOrderInput | SortOrder
    conversationId?: SortOrderInput | SortOrder
    messageId?: SortOrderInput | SortOrder
    title?: SortOrder
    body?: SortOrder
    dataJson?: SortOrderInput | SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    nextAttemptAt?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    sentAt?: SortOrderInput | SortOrder
  }

  export type NotificationJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: NotificationJobWhereInput | NotificationJobWhereInput[]
    OR?: NotificationJobWhereInput[]
    NOT?: NotificationJobWhereInput | NotificationJobWhereInput[]
    type?: StringFilter<"NotificationJob"> | string
    recipientUserId?: StringFilter<"NotificationJob"> | string
    actorUserId?: StringNullableFilter<"NotificationJob"> | string | null
    conversationId?: StringNullableFilter<"NotificationJob"> | string | null
    messageId?: StringNullableFilter<"NotificationJob"> | string | null
    title?: StringFilter<"NotificationJob"> | string
    body?: StringFilter<"NotificationJob"> | string
    dataJson?: JsonNullableFilter<"NotificationJob">
    status?: StringFilter<"NotificationJob"> | string
    attemptCount?: IntFilter<"NotificationJob"> | number
    nextAttemptAt?: DateTimeNullableFilter<"NotificationJob"> | Date | string | null
    lastError?: StringNullableFilter<"NotificationJob"> | string | null
    createdAt?: DateTimeFilter<"NotificationJob"> | Date | string
    updatedAt?: DateTimeFilter<"NotificationJob"> | Date | string
    sentAt?: DateTimeNullableFilter<"NotificationJob"> | Date | string | null
  }, "id">

  export type NotificationJobOrderByWithAggregationInput = {
    id?: SortOrder
    type?: SortOrder
    recipientUserId?: SortOrder
    actorUserId?: SortOrderInput | SortOrder
    conversationId?: SortOrderInput | SortOrder
    messageId?: SortOrderInput | SortOrder
    title?: SortOrder
    body?: SortOrder
    dataJson?: SortOrderInput | SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    nextAttemptAt?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    sentAt?: SortOrderInput | SortOrder
    _count?: NotificationJobCountOrderByAggregateInput
    _avg?: NotificationJobAvgOrderByAggregateInput
    _max?: NotificationJobMaxOrderByAggregateInput
    _min?: NotificationJobMinOrderByAggregateInput
    _sum?: NotificationJobSumOrderByAggregateInput
  }

  export type NotificationJobScalarWhereWithAggregatesInput = {
    AND?: NotificationJobScalarWhereWithAggregatesInput | NotificationJobScalarWhereWithAggregatesInput[]
    OR?: NotificationJobScalarWhereWithAggregatesInput[]
    NOT?: NotificationJobScalarWhereWithAggregatesInput | NotificationJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"NotificationJob"> | string
    type?: StringWithAggregatesFilter<"NotificationJob"> | string
    recipientUserId?: StringWithAggregatesFilter<"NotificationJob"> | string
    actorUserId?: StringNullableWithAggregatesFilter<"NotificationJob"> | string | null
    conversationId?: StringNullableWithAggregatesFilter<"NotificationJob"> | string | null
    messageId?: StringNullableWithAggregatesFilter<"NotificationJob"> | string | null
    title?: StringWithAggregatesFilter<"NotificationJob"> | string
    body?: StringWithAggregatesFilter<"NotificationJob"> | string
    dataJson?: JsonNullableWithAggregatesFilter<"NotificationJob">
    status?: StringWithAggregatesFilter<"NotificationJob"> | string
    attemptCount?: IntWithAggregatesFilter<"NotificationJob"> | number
    nextAttemptAt?: DateTimeNullableWithAggregatesFilter<"NotificationJob"> | Date | string | null
    lastError?: StringNullableWithAggregatesFilter<"NotificationJob"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"NotificationJob"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"NotificationJob"> | Date | string
    sentAt?: DateTimeNullableWithAggregatesFilter<"NotificationJob"> | Date | string | null
  }

  export type PushTokenCreateInput = {
    id?: string
    userId: string
    provider: string
    platform: string
    token: string
    deviceId?: string | null
    appVersion?: string | null
    isActive?: boolean
    lastSeenAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PushTokenUncheckedCreateInput = {
    id?: string
    userId: string
    provider: string
    platform: string
    token: string
    deviceId?: string | null
    appVersion?: string | null
    isActive?: boolean
    lastSeenAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PushTokenUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    deviceId?: NullableStringFieldUpdateOperationsInput | string | null
    appVersion?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastSeenAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PushTokenUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    deviceId?: NullableStringFieldUpdateOperationsInput | string | null
    appVersion?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastSeenAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PushTokenCreateManyInput = {
    id?: string
    userId: string
    provider: string
    platform: string
    token: string
    deviceId?: string | null
    appVersion?: string | null
    isActive?: boolean
    lastSeenAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PushTokenUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    deviceId?: NullableStringFieldUpdateOperationsInput | string | null
    appVersion?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastSeenAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PushTokenUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    platform?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    deviceId?: NullableStringFieldUpdateOperationsInput | string | null
    appVersion?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    lastSeenAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type NotificationJobCreateInput = {
    id?: string
    type: string
    recipientUserId: string
    actorUserId?: string | null
    conversationId?: string | null
    messageId?: string | null
    title: string
    body: string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: string
    attemptCount?: number
    nextAttemptAt?: Date | string | null
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    sentAt?: Date | string | null
  }

  export type NotificationJobUncheckedCreateInput = {
    id?: string
    type: string
    recipientUserId: string
    actorUserId?: string | null
    conversationId?: string | null
    messageId?: string | null
    title: string
    body: string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: string
    attemptCount?: number
    nextAttemptAt?: Date | string | null
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    sentAt?: Date | string | null
  }

  export type NotificationJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    recipientUserId?: StringFieldUpdateOperationsInput | string
    actorUserId?: NullableStringFieldUpdateOperationsInput | string | null
    conversationId?: NullableStringFieldUpdateOperationsInput | string | null
    messageId?: NullableStringFieldUpdateOperationsInput | string | null
    title?: StringFieldUpdateOperationsInput | string
    body?: StringFieldUpdateOperationsInput | string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    nextAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sentAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type NotificationJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    recipientUserId?: StringFieldUpdateOperationsInput | string
    actorUserId?: NullableStringFieldUpdateOperationsInput | string | null
    conversationId?: NullableStringFieldUpdateOperationsInput | string | null
    messageId?: NullableStringFieldUpdateOperationsInput | string | null
    title?: StringFieldUpdateOperationsInput | string
    body?: StringFieldUpdateOperationsInput | string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    nextAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sentAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type NotificationJobCreateManyInput = {
    id?: string
    type: string
    recipientUserId: string
    actorUserId?: string | null
    conversationId?: string | null
    messageId?: string | null
    title: string
    body: string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: string
    attemptCount?: number
    nextAttemptAt?: Date | string | null
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    sentAt?: Date | string | null
  }

  export type NotificationJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    recipientUserId?: StringFieldUpdateOperationsInput | string
    actorUserId?: NullableStringFieldUpdateOperationsInput | string | null
    conversationId?: NullableStringFieldUpdateOperationsInput | string | null
    messageId?: NullableStringFieldUpdateOperationsInput | string | null
    title?: StringFieldUpdateOperationsInput | string
    body?: StringFieldUpdateOperationsInput | string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    nextAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sentAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type NotificationJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    recipientUserId?: StringFieldUpdateOperationsInput | string
    actorUserId?: NullableStringFieldUpdateOperationsInput | string | null
    conversationId?: NullableStringFieldUpdateOperationsInput | string | null
    messageId?: NullableStringFieldUpdateOperationsInput | string | null
    title?: StringFieldUpdateOperationsInput | string
    body?: StringFieldUpdateOperationsInput | string
    dataJson?: NullableJsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    attemptCount?: IntFieldUpdateOperationsInput | number
    nextAttemptAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sentAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type PushTokenProviderTokenCompoundUniqueInput = {
    provider: string
    token: string
  }

  export type PushTokenCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    platform?: SortOrder
    token?: SortOrder
    deviceId?: SortOrder
    appVersion?: SortOrder
    isActive?: SortOrder
    lastSeenAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PushTokenMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    platform?: SortOrder
    token?: SortOrder
    deviceId?: SortOrder
    appVersion?: SortOrder
    isActive?: SortOrder
    lastSeenAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PushTokenMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    provider?: SortOrder
    platform?: SortOrder
    token?: SortOrder
    deviceId?: SortOrder
    appVersion?: SortOrder
    isActive?: SortOrder
    lastSeenAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }
  export type JsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NotificationJobCountOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    recipientUserId?: SortOrder
    actorUserId?: SortOrder
    conversationId?: SortOrder
    messageId?: SortOrder
    title?: SortOrder
    body?: SortOrder
    dataJson?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    nextAttemptAt?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    sentAt?: SortOrder
  }

  export type NotificationJobAvgOrderByAggregateInput = {
    attemptCount?: SortOrder
  }

  export type NotificationJobMaxOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    recipientUserId?: SortOrder
    actorUserId?: SortOrder
    conversationId?: SortOrder
    messageId?: SortOrder
    title?: SortOrder
    body?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    nextAttemptAt?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    sentAt?: SortOrder
  }

  export type NotificationJobMinOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    recipientUserId?: SortOrder
    actorUserId?: SortOrder
    conversationId?: SortOrder
    messageId?: SortOrder
    title?: SortOrder
    body?: SortOrder
    status?: SortOrder
    attemptCount?: SortOrder
    nextAttemptAt?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    sentAt?: SortOrder
  }

  export type NotificationJobSumOrderByAggregateInput = {
    attemptCount?: SortOrder
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use PushTokenDefaultArgs instead
     */
    export type PushTokenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PushTokenDefaultArgs<ExtArgs>
    /**
     * @deprecated Use NotificationJobDefaultArgs instead
     */
    export type NotificationJobArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = NotificationJobDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}