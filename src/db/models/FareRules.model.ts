import { Table, Column, Model, PrimaryKey, Default, IsIn, ForeignKey } from 'sequelize-typescript';
import { FareAttributes } from './FareAttributes.model'
import { Stops } from './Stops.model';


@Table
export class FareRules extends Model {
  @ForeignKey(() => FareAttributes)
  @Column
  fare_id: string

  @ForeignKey(() => Stops)
  @Column
  origin_id: string

  @ForeignKey(() => Stops)
  @Column
  destination_id: string
}