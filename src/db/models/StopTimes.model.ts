
import { Table, Column, Model, ForeignKey } from 'sequelize-typescript';
import { Stops } from './Stops.model'
import { Trips } from './Trips.model'

@Table
export class StopTimes extends Model {
    @Column
    @ForeignKey(() => Trips)
    trip_id: string

    @Column
    arrival_time: string

    @Column
    departure_time: string

    @Column
    @ForeignKey(() => Stops)
    stop_id: string

    @Column
    stop_sequence: number

    @Column
    timepoint: string

    @Column
    shape_dist_traveled: string
}