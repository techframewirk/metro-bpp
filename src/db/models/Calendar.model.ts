import { Table, Column, Model, PrimaryKey, IsIn } from 'sequelize-typescript';

@Table
export class Calendar extends Model {
    @PrimaryKey
    @Column
    service_id: string

    @IsIn([["0", "1"]])
    @Column
    monday: number

    @IsIn([["0", "1"]])
    @Column
    tuesday: number

    @IsIn([["0", "1"]])
    @Column
    wednesday: number

    @IsIn([["0", "1"]])
    @Column
    thursday: number

    @IsIn([["0", "1"]])
    @Column
    friday: number

    @IsIn([["0", "1"]])
    @Column
    saturday: number

    @IsIn([["0", "1"]])
    @Column
    sunday: number

    @Column
    start_date: Date

    @Column
    end_date: Date
}