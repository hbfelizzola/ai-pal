// The two main Usage Windows: their names and colours, in one place.
import { COOL, WARM, type Pair } from './look'

export type MainWindow = 'five_hour' | 'seven_day'

export const WINDOWS: Record<MainWindow, { name: string; colors: Pair }> = {
  five_hour: { name: '5-hour', colors: WARM },
  seven_day: { name: 'Weekly', colors: COOL },
}
