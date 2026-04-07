import { registry } from '../engine/registry';
import ContainerWidget from './layout/ContainerWidget';
import DividerWidget from './layout/DividerWidget';
import SpacerWidget from './layout/SpacerWidget';
import TextWidget from './basic/TextWidget';
import ButtonWidget from './basic/ButtonWidget';
import IconWidget from './basic/IconWidget';
import LinkWidget from './basic/LinkWidget';
import BadgeWidget from './basic/BadgeWidget';
import InputWidget from './form/InputWidget';
import SelectWidget from './form/SelectWidget';
import CheckboxWidget from './form/CheckboxWidget';
import ImageWidget from './media/ImageWidget';
import TableWidget from './data/TableWidget';
import ChartWidget from './data/ChartWidget';
import RepeaterWidget from './data/RepeaterWidget';
import StatWidget from './data/StatWidget';
import FormWidget from './advanced/FormWidget';
import TabsWidget from './advanced/TabsWidget';
import ModalWidget from './advanced/ModalWidget';
import CardWidget from './advanced/CardWidget';
import AlertWidget from './advanced/AlertWidget';

const allWidgets = [
  ContainerWidget, DividerWidget, SpacerWidget,
  TextWidget, ButtonWidget, IconWidget, LinkWidget, BadgeWidget,
  InputWidget, SelectWidget, CheckboxWidget,
  ImageWidget,
  TableWidget, ChartWidget, RepeaterWidget, StatWidget,
  FormWidget, TabsWidget, ModalWidget, CardWidget, AlertWidget,
];

export function registerAllWidgets() {
  for (const def of allWidgets) {
    registry.register(def);
  }
}

export { allWidgets };
