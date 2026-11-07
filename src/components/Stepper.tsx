import { Fragment } from 'react';
import { Text, View } from 'react-native';

import { Icon } from './Icon';
import { useTheme } from './ui';

/** Шаги импорта из Telegram: мастер показывает, где ты сейчас. */
export const TG_STEPS = ['Вход', 'Загрузка', 'Выбор'];

/** Индикатор шагов: пройденные с галочкой, текущий подсвечен, остальные серые. */
export function Stepper({ steps, active }: { steps: string[]; active: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }} accessibilityLabel={`Шаг ${active} из ${steps.length}: ${steps[active - 1]}`}>
      {steps.map((name, i) => {
        const n = i + 1;
        const done = n < active;
        const current = n === active;
        const lit = done || current;
        return (
          <Fragment key={name}>
            {i > 0 && <View style={{ flex: 1, height: 2, borderRadius: 1, marginTop: 11, backgroundColor: n <= active ? colors.accent : colors.hairline }} />}
            <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: lit ? colors.accent : colors.chip, alignItems: 'center', justifyContent: 'center' }}>
                {done ? (
                  <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />
                ) : (
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: lit ? colors.onAccent : colors.text3 }}>{n}</Text>
                )}
              </View>
              <Text style={{ fontFamily: current ? fonts.semibold : fonts.body, fontSize: 11, color: current ? colors.text : colors.text3 }}>{name}</Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}
