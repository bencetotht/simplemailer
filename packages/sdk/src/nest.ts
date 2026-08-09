import { SimpleMailer, type SimpleMailerOptions } from "./client.js";

export const SIMPLEMAILER = Symbol.for("@bencetotht/simplemailer");

export interface NestValueProvider<T = SimpleMailer> {
  provide: string | symbol;
  useValue: T;
}

export interface NestFactoryProvider<
  TDependencies extends readonly unknown[] = readonly unknown[],
  T = SimpleMailer,
> {
  provide: string | symbol;
  inject?: { readonly [Index in keyof TDependencies]: unknown };
  useFactory: (...dependencies: TDependencies) => T | Promise<T>;
}

export function createSimpleMailerProvider(
  options: SimpleMailerOptions,
  token: string | symbol = SIMPLEMAILER,
): NestValueProvider {
  return { provide: token, useValue: new SimpleMailer(options) };
}

export function createSimpleMailerAsyncProvider<TDependencies extends readonly unknown[]>(
  factory: (...dependencies: TDependencies) => SimpleMailerOptions | Promise<SimpleMailerOptions>,
  inject: { readonly [Index in keyof TDependencies]: unknown },
  token: string | symbol = SIMPLEMAILER,
): NestFactoryProvider<TDependencies> {
  return {
    provide: token,
    inject,
    async useFactory(...dependencies: TDependencies) {
      return new SimpleMailer(await factory(...dependencies));
    },
  };
}
