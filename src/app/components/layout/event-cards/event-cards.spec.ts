import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventCards } from './event-cards';

describe('EventCards', () => {
  let component: EventCards;
  let fixture: ComponentFixture<EventCards>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventCards]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventCards);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
