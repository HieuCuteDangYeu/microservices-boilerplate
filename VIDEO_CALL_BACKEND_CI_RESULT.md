# Backend Video Call CI Result

- Build exit: 0
- Tests exit: 1

## Build
```text

> microservices-boilerplate@0.0.1 build:call /home/runner/work/microservices-boilerplate/microservices-boilerplate
> nest build call-service

```

## Tests
```text
      at TestingInjector.loadInstance (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:77:13)
      at TestingInjector.loadProvider (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:111:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:56:13
          at async Promise.all (index 3)
      at TestingInstanceLoader.createInstancesOfProviders (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:55:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:40:13
          at async Promise.all (index 5)
      at TestingInstanceLoader.createInstances (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:39:9)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:22:13)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-instance-loader.js:9:9)
      at TestingModuleBuilder.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:119:9)
      at TestingModuleBuilder.compile (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:74:9)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:490:17)

  ● Call Service P0 flow (e2e) › ends an active call after the reconnect grace window expires

    TypeError: Cannot read properties of undefined (reading 'close')

    [0m [90m 556 |[39m     )[33m;[39m
     [90m 557 |[39m     sockets[33m.[39mlength [33m=[39m [35m0[39m[33m;[39m
    [31m[1m>[22m[39m[90m 558 |[39m     [36mawait[39m app[33m.[39mclose()[33m;[39m
     [90m     |[39m               [31m[1m^[22m[39m
     [90m 559 |[39m     redis[33m.[39mreset()[33m;[39m
     [90m 560 |[39m     eventPublisher[33m.[39mreset()[33m;[39m
     [90m 561 |[39m     mediaEngine[33m.[39mreset()[33m;[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:558:15)

  ● Call Service P0 flow (e2e) › rejoins an active call within the reconnect grace window

    TypeError: Configuration key "RABBITMQ_URL" does not exist

    [0m [90m 38 |[39m           transport[33m:[39m [33mTransport[39m[33m.[39m[33mRMQ[39m[33m,[39m
     [90m 39 |[39m           options[33m:[39m {
    [31m[1m>[22m[39m[90m 40 |[39m             urls[33m:[39m [config[33m.[39mgetOrThrow[33m<[39m[33mstring[39m[33m>[39m([32m'RABBITMQ_URL'[39m)][33m,[39m
     [90m    |[39m                           [31m[1m^[22m[39m
     [90m 41 |[39m             queue[33m:[39m [32m'call_queue'[39m[33m,[39m
     [90m 42 |[39m             queueOptions[33m:[39m { durable[33m:[39m [36mtrue[39m }[33m,[39m
     [90m 43 |[39m           }[33m,[39m[0m

      at ConfigService.getOrThrow (node_modules/.pnpm/@nestjs+config@4.0.4_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__rxjs@7.8.2/node_modules/@nestjs/config/dist/config.service.js:132:19)
      at useFactory (apps/call-service/src/call-service.module.ts:40:27)
      at InstanceWrapper.metatype (node_modules/.pnpm/@nestjs+microservices@11.1.27_@grpc+grpc-js@1.14.4_@nestjs+common@11.1.27_reflect-metadata@0._odzzo43mburmyplniugplvcge4/node_modules/@nestjs/microservices/module/clients.module.js:72:41)
      at TestingInjector.instantiateClass (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:435:55)
      at callback (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:72:45)
      at TestingInjector.resolveConstructorParams (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:180:24)
      at TestingInjector.loadInstance (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:77:13)
      at TestingInjector.loadProvider (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:111:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:56:13
          at async Promise.all (index 3)
      at TestingInstanceLoader.createInstancesOfProviders (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:55:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:40:13
          at async Promise.all (index 5)
      at TestingInstanceLoader.createInstances (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:39:9)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:22:13)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-instance-loader.js:9:9)
      at TestingModuleBuilder.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:119:9)
      at TestingModuleBuilder.compile (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:74:9)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:490:17)

  ● Call Service P0 flow (e2e) › rejoins an active call within the reconnect grace window

    TypeError: Cannot read properties of undefined (reading 'close')

    [0m [90m 556 |[39m     )[33m;[39m
     [90m 557 |[39m     sockets[33m.[39mlength [33m=[39m [35m0[39m[33m;[39m
    [31m[1m>[22m[39m[90m 558 |[39m     [36mawait[39m app[33m.[39mclose()[33m;[39m
     [90m     |[39m               [31m[1m^[22m[39m
     [90m 559 |[39m     redis[33m.[39mreset()[33m;[39m
     [90m 560 |[39m     eventPublisher[33m.[39mreset()[33m;[39m
     [90m 561 |[39m     mediaEngine[33m.[39mreset()[33m;[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:558:15)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts after the reconnect grace window has already expired

    TypeError: Configuration key "RABBITMQ_URL" does not exist

    [0m [90m 38 |[39m           transport[33m:[39m [33mTransport[39m[33m.[39m[33mRMQ[39m[33m,[39m
     [90m 39 |[39m           options[33m:[39m {
    [31m[1m>[22m[39m[90m 40 |[39m             urls[33m:[39m [config[33m.[39mgetOrThrow[33m<[39m[33mstring[39m[33m>[39m([32m'RABBITMQ_URL'[39m)][33m,[39m
     [90m    |[39m                           [31m[1m^[22m[39m
     [90m 41 |[39m             queue[33m:[39m [32m'call_queue'[39m[33m,[39m
     [90m 42 |[39m             queueOptions[33m:[39m { durable[33m:[39m [36mtrue[39m }[33m,[39m
     [90m 43 |[39m           }[33m,[39m[0m

      at ConfigService.getOrThrow (node_modules/.pnpm/@nestjs+config@4.0.4_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__rxjs@7.8.2/node_modules/@nestjs/config/dist/config.service.js:132:19)
      at useFactory (apps/call-service/src/call-service.module.ts:40:27)
      at InstanceWrapper.metatype (node_modules/.pnpm/@nestjs+microservices@11.1.27_@grpc+grpc-js@1.14.4_@nestjs+common@11.1.27_reflect-metadata@0._odzzo43mburmyplniugplvcge4/node_modules/@nestjs/microservices/module/clients.module.js:72:41)
      at TestingInjector.instantiateClass (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:435:55)
      at callback (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:72:45)
      at TestingInjector.resolveConstructorParams (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:180:24)
      at TestingInjector.loadInstance (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:77:13)
      at TestingInjector.loadProvider (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:111:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:56:13
          at async Promise.all (index 3)
      at TestingInstanceLoader.createInstancesOfProviders (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:55:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:40:13
          at async Promise.all (index 5)
      at TestingInstanceLoader.createInstances (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:39:9)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:22:13)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-instance-loader.js:9:9)
      at TestingModuleBuilder.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:119:9)
      at TestingModuleBuilder.compile (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:74:9)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:490:17)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts after the reconnect grace window has already expired

    TypeError: Cannot read properties of undefined (reading 'close')

    [0m [90m 556 |[39m     )[33m;[39m
     [90m 557 |[39m     sockets[33m.[39mlength [33m=[39m [35m0[39m[33m;[39m
    [31m[1m>[22m[39m[90m 558 |[39m     [36mawait[39m app[33m.[39mclose()[33m;[39m
     [90m     |[39m               [31m[1m^[22m[39m
     [90m 559 |[39m     redis[33m.[39mreset()[33m;[39m
     [90m 560 |[39m     eventPublisher[33m.[39mreset()[33m;[39m
     [90m 561 |[39m     mediaEngine[33m.[39mreset()[33m;[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:558:15)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts from users outside the active call

    TypeError: Configuration key "RABBITMQ_URL" does not exist

    [0m [90m 38 |[39m           transport[33m:[39m [33mTransport[39m[33m.[39m[33mRMQ[39m[33m,[39m
     [90m 39 |[39m           options[33m:[39m {
    [31m[1m>[22m[39m[90m 40 |[39m             urls[33m:[39m [config[33m.[39mgetOrThrow[33m<[39m[33mstring[39m[33m>[39m([32m'RABBITMQ_URL'[39m)][33m,[39m
     [90m    |[39m                           [31m[1m^[22m[39m
     [90m 41 |[39m             queue[33m:[39m [32m'call_queue'[39m[33m,[39m
     [90m 42 |[39m             queueOptions[33m:[39m { durable[33m:[39m [36mtrue[39m }[33m,[39m
     [90m 43 |[39m           }[33m,[39m[0m

      at ConfigService.getOrThrow (node_modules/.pnpm/@nestjs+config@4.0.4_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__rxjs@7.8.2/node_modules/@nestjs/config/dist/config.service.js:132:19)
      at useFactory (apps/call-service/src/call-service.module.ts:40:27)
      at InstanceWrapper.metatype (node_modules/.pnpm/@nestjs+microservices@11.1.27_@grpc+grpc-js@1.14.4_@nestjs+common@11.1.27_reflect-metadata@0._odzzo43mburmyplniugplvcge4/node_modules/@nestjs/microservices/module/clients.module.js:72:41)
      at TestingInjector.instantiateClass (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:435:55)
      at callback (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:72:45)
      at TestingInjector.resolveConstructorParams (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:180:24)
      at TestingInjector.loadInstance (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:77:13)
      at TestingInjector.loadProvider (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:111:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:56:13
          at async Promise.all (index 3)
      at TestingInstanceLoader.createInstancesOfProviders (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:55:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:40:13
          at async Promise.all (index 5)
      at TestingInstanceLoader.createInstances (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:39:9)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:22:13)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-instance-loader.js:9:9)
      at TestingModuleBuilder.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:119:9)
      at TestingModuleBuilder.compile (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:74:9)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:490:17)

  ● Call Service P0 flow (e2e) › rejects rejoin attempts from users outside the active call

    TypeError: Cannot read properties of undefined (reading 'close')

    [0m [90m 556 |[39m     )[33m;[39m
     [90m 557 |[39m     sockets[33m.[39mlength [33m=[39m [35m0[39m[33m;[39m
    [31m[1m>[22m[39m[90m 558 |[39m     [36mawait[39m app[33m.[39mclose()[33m;[39m
     [90m     |[39m               [31m[1m^[22m[39m
     [90m 559 |[39m     redis[33m.[39mreset()[33m;[39m
     [90m 560 |[39m     eventPublisher[33m.[39mreset()[33m;[39m
     [90m 561 |[39m     mediaEngine[33m.[39mreset()[33m;[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:558:15)

  ● Call Service P0 flow (e2e) › keeps the call active when one socket disconnects but the same user still has another socket in the call

    TypeError: Configuration key "RABBITMQ_URL" does not exist

    [0m [90m 38 |[39m           transport[33m:[39m [33mTransport[39m[33m.[39m[33mRMQ[39m[33m,[39m
     [90m 39 |[39m           options[33m:[39m {
    [31m[1m>[22m[39m[90m 40 |[39m             urls[33m:[39m [config[33m.[39mgetOrThrow[33m<[39m[33mstring[39m[33m>[39m([32m'RABBITMQ_URL'[39m)][33m,[39m
     [90m    |[39m                           [31m[1m^[22m[39m
     [90m 41 |[39m             queue[33m:[39m [32m'call_queue'[39m[33m,[39m
     [90m 42 |[39m             queueOptions[33m:[39m { durable[33m:[39m [36mtrue[39m }[33m,[39m
     [90m 43 |[39m           }[33m,[39m[0m

      at ConfigService.getOrThrow (node_modules/.pnpm/@nestjs+config@4.0.4_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__rxjs@7.8.2/node_modules/@nestjs/config/dist/config.service.js:132:19)
      at useFactory (apps/call-service/src/call-service.module.ts:40:27)
      at InstanceWrapper.metatype (node_modules/.pnpm/@nestjs+microservices@11.1.27_@grpc+grpc-js@1.14.4_@nestjs+common@11.1.27_reflect-metadata@0._odzzo43mburmyplniugplvcge4/node_modules/@nestjs/microservices/module/clients.module.js:72:41)
      at TestingInjector.instantiateClass (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:435:55)
      at callback (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:72:45)
      at TestingInjector.resolveConstructorParams (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:180:24)
      at TestingInjector.loadInstance (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:77:13)
      at TestingInjector.loadProvider (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/injector.js:111:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:56:13
          at async Promise.all (index 3)
      at TestingInstanceLoader.createInstancesOfProviders (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:55:9)
      at node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:40:13
          at async Promise.all (index 5)
      at TestingInstanceLoader.createInstances (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:39:9)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+core@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+micros_erf3kckpealzdkvspd2eqkxt7e/node_modules/@nestjs/core/injector/instance-loader.js:22:13)
      at TestingInstanceLoader.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-instance-loader.js:9:9)
      at TestingModuleBuilder.createInstancesOfDependencies (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:119:9)
      at TestingModuleBuilder.compile (node_modules/.pnpm/@nestjs+testing@11.1.27_@nestjs+common@11.1.27_reflect-metadata@0.2.2_rxjs@7.8.2__@nestjs+cor_4njjz437ncnj4xb6oxqwjpz5qe/node_modules/@nestjs/testing/testing-module.builder.js:74:9)
      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:490:17)

  ● Call Service P0 flow (e2e) › keeps the call active when one socket disconnects but the same user still has another socket in the call

    TypeError: Cannot read properties of undefined (reading 'close')

    [0m [90m 556 |[39m     )[33m;[39m
     [90m 557 |[39m     sockets[33m.[39mlength [33m=[39m [35m0[39m[33m;[39m
    [31m[1m>[22m[39m[90m 558 |[39m     [36mawait[39m app[33m.[39mclose()[33m;[39m
     [90m     |[39m               [31m[1m^[22m[39m
     [90m 559 |[39m     redis[33m.[39mreset()[33m;[39m
     [90m 560 |[39m     eventPublisher[33m.[39mreset()[33m;[39m
     [90m 561 |[39m     mediaEngine[33m.[39mreset()[33m;[39m[0m

      at Object.<anonymous> (apps/call-service/test/e2e/call-flow.e2e.spec.ts:558:15)

PASS apps/call-service/test/unit/application/call-lifecycle.use-case.spec.ts
PASS apps/call-service/test/unit/application/video-call.use-case.spec.ts

Test Suites: 1 failed, 2 passed, 3 total
Tests:       17 failed, 14 passed, 31 total
Snapshots:   0 total
Time:        1.729 s
Ran all test suites matching apps/call-service/test/unit/application|apps/call-service/test/e2e/call-flow.e2e.spec.ts.
```
