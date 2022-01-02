import { Table, Column, Model, PrimaryKey, Default, IsIn } from 'sequelize-typescript';

@Table
export class FareAttributes extends Model {
  @PrimaryKey
  @Column
  fare_id: string

  @Column
  price: string

  @Column
  currency_type: string

  @Column
  payment_method: string

  @Column
  transfers: string
}