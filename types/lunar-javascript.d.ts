// types/lunar-javascript.d.ts
declare module 'lunar-javascript' {
    export interface Lunar {
      getYear(): number;
      getMonth(): number;
      getDay(): number;
      getSolar(): Solar;
      toString(): string;
    }
  
    export interface Solar {
      getYear(): number;
      getMonth(): number;
      getDay(): number;
      getLunar(): Lunar;
      toString(): string;
    }
  
    export const Lunar: {
      fromDate(date: Date): Lunar;
      fromYmd(year: number, month: number, day: number): Lunar;
    };
  
    export const Solar: {
      fromDate(date: Date): Solar;
      fromYmd(year: number, month: number, day: number): Solar;
    };
  }