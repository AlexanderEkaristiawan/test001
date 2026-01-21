import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizerCreateEvent } from './organizer-create-event';

describe('OrganizerCreateEvent', () => {
  let component: OrganizerCreateEvent;
  let fixture: ComponentFixture<OrganizerCreateEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerCreateEvent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganizerCreateEvent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
