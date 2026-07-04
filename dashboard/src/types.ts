/* eslint-disable @typescript-eslint/no-empty-object-type */

import type React from "react";

export type Params<T = {}> = Promise<T & { lang: string }>;

export type GenerateMetadataProps<T = {}> = {
  params: Params<T>;
};

export type LayoutProps<T = {}> = {
  children: React.ReactNode;
  params: Params<T>;
};

export type PageProps<T = {}, P = {}> = T & {
  params: Params<P>;
};
