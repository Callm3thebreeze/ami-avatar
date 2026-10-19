declare class RobotAvatar {
  constructor(host: HTMLElement, options?: RobotAvatar.Options);
  static readonly states: RobotAvatar.State[];
  static stateInfo(name: string): RobotAvatar.StateInfo | null;
  readonly el: HTMLDivElement;
  readonly state: RobotAvatar.State;
  readonly mouthOpen: number;
  readonly intensity: number;
  readonly reduced: boolean;
  /** Indica si la simulación de boca está activa; no representa audio real. */
  readonly speaking: boolean;
  onChange: ((info: RobotAvatar.ChangeInfo) => void) | null;
  setState(name: RobotAvatar.State, options?: { instant?: boolean }): boolean;
  setMouthOpen(value: number, duration?: number): number;
  setIntensity(value: number): number;
  setReducedMotion(on: boolean): boolean;
  setSpeechSimulation(on: boolean): void;
  stopSpeechSim(): void;
  reset(): void;
  destroy(): void;
}
declare namespace RobotAvatar {
  type State = 'reposo' | 'escucha' | 'pensamiento' | 'habla' | 'alegria' | 'duda' | 'sorpresa';
  interface Options {
    intensity?: number;
    reducedMotion?: boolean;
    /** true por compatibilidad con la demo; usar false para audio real. */
    speechSimulation?: boolean;
    onChange?: (info: ChangeInfo) => void;
  }
  interface StateInfo { label: string; hint: string; }
  interface ChangeInfo extends StateInfo {
    state: State;
    speaking: boolean;
    reduced: boolean;
    intensity: number;
    mouthOpen: number;
  }
}
export = RobotAvatar;
